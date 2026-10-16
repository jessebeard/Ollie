import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { hotp, totp, verifyTotp, parseOtpauthUri, buildOtpauthUri, codeFromOtpauthUri, normalizeTotpInput } from '../../src/information-theory/cryptography/totp.js';
import { encodeBase32 } from '../../src/utils/base32.js';

// RFC 4226 Appendix D test key (ASCII "12345678901234567890")
const HOTP_KEY = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x30,
    0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x30]);

// RFC 6238 Annex B seeds (different lengths per algorithm)
const SEED_SHA1 = new TextEncoder().encode('12345678901234567890');
const SEED_SHA256 = new TextEncoder().encode('12345678901234567890123456789012');
const SEED_SHA512 = new TextEncoder().encode('1234567890123456789012345678901234567890123456789012345678901234');

describe('HOTP core (RFC 4226 Appendix D)', () => {
    const vectors = [
        [0, '755224'], [1, '287082'], [2, '359152'], [3, '969429'],
        [4, '338314'], [5, '254676'], [6, '287922'], [7, '162583'],
        [8, '399871'], [9, '520489']
    ];

    for (const [counter, expected] of vectors) {
        it(`counter ${counter} → ${expected}`, async () => {
            const [code, err] = await hotp(HOTP_KEY, counter);
            expect(err).toBe(null);
            expect(code).toBe(expected);
        });
    }

    it('rejects invalid params via tuple', async () => {
        const [, emptyKey] = await hotp(new Uint8Array(0), 0);
        expect(emptyKey).toBeInstanceOf(Error);
        const [, negCounter] = await hotp(HOTP_KEY, -1);
        expect(negCounter).toBeInstanceOf(Error);
        const [, badAlgo] = await hotp(HOTP_KEY, 0, { algorithm: 'MD5' });
        expect(badAlgo).toBeInstanceOf(Error);
        const [, bigDigits] = await hotp(HOTP_KEY, 0, { digits: 11 });
        expect(bigDigits).toBeInstanceOf(Error);
    });

    it('supports SHA-256', async () => {
        const [code, err] = await hotp(HOTP_KEY, 0, { algorithm: 'SHA-256' });
        expect(err).toBe(null);
        expect(typeof code).toBe('string');
        expect(code).toHaveLength(6);
    });
});

describe('TOTP wrapper (RFC 6238 Annex B)', () => {
    // T0=0, X=30, 8-digit output
    const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
    const expected = {
        'SHA-1': ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'],
        'SHA-256': ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'],
        'SHA-512': ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826']
    };

    for (let t = 0; t < times.length; t++) {
        for (const algo of ['SHA-1', 'SHA-256', 'SHA-512']) {
            it(`T=${times[t]} ${algo} → ${expected[algo][t]}`, async () => {
                const seed = algo === 'SHA-1' ? SEED_SHA1 : algo === 'SHA-256' ? SEED_SHA256 : SEED_SHA512;
                const [code, err] = await totp(seed, { now: times[t], digits: 8, algorithm: algo });
                expect(err).toBe(null);
                expect(code).toBe(expected[algo][t]);
            });
        }
    }
});

describe('TOTP drift window verification', () => {
    it('verifies current step', async () => {
        const [result, err] = await verifyTotp(SEED_SHA1, '94287082', { now: 59, digits: 8 });
        expect(err).toBe(null);
        expect(result.valid).toBe(true);
    });

    it('verifies ±window steps and reports matched offset', async () => {
        // At T=89 (step 2), the code from step 1 (T=59) should verify with window=1
        const [code] = await totp(SEED_SHA1, { now: 59, digits: 8 });
        const [result, err] = await verifyTotp(SEED_SHA1, code, { now: 89, window: 1, digits: 8 });
        expect(err).toBe(null);
        expect(result.valid).toBe(true);
    });

    it('rejects codes outside the window', async () => {
        const [codeAtStep0] = await totp(SEED_SHA1, { now: 59, digits: 8 });
        // At T=149 (step 4), step 0 is 4 steps away — outside window=1
        const [result] = await verifyTotp(SEED_SHA1, codeAtStep0, { now: 149, window: 1, digits: 8 });
        expect(result.valid).toBe(false);
    });
});

describe('otpauth:// URI handling', () => {

    it('parses a standard Google Authenticator URI', () => {
        const uri = 'otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example';
        const [p, err] = parseOtpauthUri(uri);
        expect(err).toBe(null);
        expect(p.secret).toBe('JBSWY3DPEHPK3PXP');
        expect(p.label).toBe('Example:user@example.com');
        expect(p.issuer).toBe('Example');
        expect(p.algorithm).toBe('SHA-1');
        expect(p.digits).toBe(6);
        expect(p.period).toBe(30);
    });

    it('builds a URI that roundtrips through parse', () => {
        const input = { label: 'Test:alice', secret: 'SECRET234', issuer: 'TestCorp', algorithm: 'SHA-256', digits: 8, period: 60 };
        const [uri, buildErr] = buildOtpauthUri(input);
        expect(buildErr).toBe(null);

        const [parsed, parseErr] = parseOtpauthUri(uri);
        expect(parseErr).toBe(null);
        expect(parsed.secret).toBe('SECRET234');
        expect(parsed.algorithm).toBe('SHA-256');
        expect(parsed.digits).toBe(8);
        expect(parsed.period).toBe(60);
        expect(parsed.issuer).toBe('TestCorp');
    });

    it('rejects malformed URIs via tuple', () => {
        const cases = [
            'https://not-totp',
            'otpauth://hotp/label?secret=x',
            'otpauth://totp/nolabel',
            'otpauth://totp/label?issuer=NoSecret'
        ];
        for (const bad of cases) {
            const [, err] = parseOtpauthUri(bad);
            expect(err).toBeInstanceOf(Error);
        }
    });

    it('generates exact RFC vectors when routed through an otpauth URI', async () => {
        // The secret must be DECODED from Base32, not UTF-8-encoded as text.
        const [uri, buildErr] = buildOtpauthUri({
            label: 'RFC:vector',
            secret: encodeBase32(SEED_SHA1),
            algorithm: 'SHA-1',
            digits: 8
        });
        expect(buildErr).toBe(null);
        const [code, err] = await codeFromOtpauthUri(uri, { now: 59 });
        expect(err).toBe(null);
        expect(code).toBe('94287082');
    });

    it('routes SHA-256 parameters through the URI to exact RFC vectors', async () => {
        const [uri, buildErr] = buildOtpauthUri({
            label: 'RFC:sha256',
            secret: encodeBase32(SEED_SHA256),
            algorithm: 'SHA-256',
            digits: 8
        });
        expect(buildErr).toBe(null);
        const [code, err] = await codeFromOtpauthUri(uri, { now: 1111111109 });
        expect(err).toBe(null);
        expect(code).toBe('68084774');
    });

    it('rejects non-Base32 secrets with a typed tuple error', async () => {
        const [code, err] = await codeFromOtpauthUri('otpauth://totp/x?secret=AB!CDEF');
        expect(err).toBeInstanceOf(Error);
        expect(code).toBe(null);
    });

    it('full roundtrip: URI → decoded secret → exact RFC code at known time', async () => {
        const uri = 'otpauth://totp/Test:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Test&digits=8';
        const [code, genErr] = await codeFromOtpauthUri(uri, { now: 59 });
        expect(genErr).toBe(null);
        expect(code).toBe('94287082');
    });
});

describe('normalizeTotpInput (entry authoring helper)', () => {
    it('wraps bare Base32 secrets into an otpauth URI titled by the entry', () => {
        const [uri, err] = normalizeTotpInput('JBSWY3DPEHPK3PXP', 'GitHub');
        expect(err).toBe(null);
        expect(uri).toBe('otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP');
    });

    it('passes otpauth URIs through verbatim', () => {
        const uri = 'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example';
        const [out, err] = normalizeTotpInput(uri, 'Ignored');
        expect(err).toBe(null);
        expect(out).toBe(uri);
    });

    it('maps empty input to undefined without error', () => {
        for (const empty of ['', undefined, null]) {
            const [out, err] = normalizeTotpInput(empty, 'X');
            expect(err).toBe(null);
            expect(out).toBeUndefined();
        }
    });

    it('rejects garbage and short strings via tuple error', () => {
        for (const bad of ['not a secret!!', 'ABC', 'otpauth://hotp/x?secret=AB']) {
            const [out, err] = normalizeTotpInput(bad, 'X');
            expect(err).toBeInstanceOf(Error);
            expect(out).toBe(null);
        }
    });

    describe('PBT & Metamorphic Testing (Clock & Boundaries)', () => {
        it('Metamorphic MR: time step window stability', async () => {
            // Within any single 30-second window [30*k, 30*k + 29], TOTP code must be identical
            const key = new TextEncoder().encode('12345678901234567890');
            await assertProperty(
                [Arbitrary.integer(1000, 100000), Arbitrary.integer(0, 29)],
                async (windowIndex, offset) => {
                    const tStart = windowIndex * 30;
                    const tOffset = tStart + offset;

                    const [c1] = await totp(key, { now: tStart });
                    const [c2] = await totp(key, { now: tOffset });

                    expect(c1).toBe(c2);
                },
                50
            );
        });

        it('Metamorphic MR: drift symmetry in verifyTotp', async () => {
            const key = new TextEncoder().encode('12345678901234567890');
            await assertProperty(
                [Arbitrary.integer(1000, 50000)],
                async (step) => {
                    const tNow = step * 30;
                    const [liveCode] = await totp(key, { now: tNow });

                    // At exactly now, window 0 must verify
                    const [v0] = await verifyTotp(key, liveCode, { now: tNow, window: 0 });
                    expect(v0.valid).toBe(true);

                    // At tNow + 30, window 1 must verify, but window 0 must fail
                    const [vPlus1_w1] = await verifyTotp(key, liveCode, { now: tNow + 30, window: 1 });
                    const [vPlus1_w0] = await verifyTotp(key, liveCode, { now: tNow + 30, window: 0 });
                    expect(vPlus1_w1.valid).toBe(true);
                    expect(vPlus1_w0.valid).toBe(false);

                    // At tNow - 30, window 1 must verify, but window 0 must fail
                    const [vMinus1_w1] = await verifyTotp(key, liveCode, { now: tNow - 30, window: 1 });
                    const [vMinus1_w0] = await verifyTotp(key, liveCode, { now: tNow - 30, window: 0 });
                    expect(vMinus1_w1.valid).toBe(true);
                    expect(vMinus1_w0.valid).toBe(false);
                },
                30
            );
        });

        it('Property: 6-digit TOTP output strictly matches ^\\d{6}$ for arbitrary timestamps', async () => {
            const key = new TextEncoder().encode('secret-test-key-20-bytes');
            await assertProperty(
                [Arbitrary.positiveInteger(2000000000)],
                async (timestamp) => {
                    const [code, err] = await totp(key, { now: timestamp, digits: 6 });
                    expect(err).toBe(null);
                    expect(typeof code).toBe('string');
                    expect(code.length).toBe(6);
                    expect(/^\d{6}$/.test(code)).toBe(true);
                },
                50
            );
        });

        it('Property: normalizeTotpInput never throws on arbitrary input string', async () => {
            await assertProperty(
                [Arbitrary.string(0, 100)],
                (candidate) => {
                    const [out, err] = normalizeTotpInput(candidate, 'Account');
                    if (err) {
                        expect(err instanceof Error).toBe(true);
                        expect(out).toBe(null);
                    } else {
                        expect(typeof out === 'string' || out === undefined).toBe(true);
                    }
                },
                50
            );
        });
    });
});
