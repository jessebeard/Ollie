import { describe, it, expect } from '../utils/test-runner.js';
import { hotp, totp, verifyTotp, parseOtpauthUri, buildOtpauthUri } from '../../src/information-theory/cryptography/totp.js';

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
            if (err) throw err;
            if (code !== expected) throw new Error(`got ${code}, expected ${expected}`);
        });
    }

    it('rejects invalid params via tuple', async () => {
        const [, emptyKey] = await hotp(new Uint8Array(0), 0);
        if (!(emptyKey instanceof Error)) throw new Error('empty key accepted');
        const [, negCounter] = await hotp(HOTP_KEY, -1);
        if (!(negCounter instanceof Error)) throw new Error('negative counter accepted');
        const [, badAlgo] = await hotp(HOTP_KEY, 0, { algorithm: 'MD5' });
        if (!(badAlgo instanceof Error)) throw new Error('unsupported algorithm accepted');
        const [, bigDigits] = await hotp(HOTP_KEY, 0, { digits: 11 });
        if (!(bigDigits instanceof Error)) throw new Error('digits > 10 accepted');
    });

    it('supports SHA-256', async () => {
        const [code, err] = await hotp(HOTP_KEY, 0, { algorithm: 'SHA-256' });
        expect(err).toBe(null);
        if (typeof code !== 'string' || code.length !== 6) throw new Error('bad code length');
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
                if (err) throw err;
                if (code !== expected[algo][t]) throw new Error(`got ${code}, expected ${expected[algo][t]}`);
            });
        }
    }
});

describe('TOTP drift window verification', () => {
    it('verifies current step', async () => {
        const [result, err] = await verifyTotp(SEED_SHA1, '94287082', { now: 59, digits: 8 });
        expect(err).toBe(null);
        if (!result.valid) throw new Error('current step not verified');
    });

    it('verifies ±window steps and reports matched offset', async () => {
        // At T=89 (step 2), the code from step 1 (T=59) should verify with window=1
        const [code] = await totp(SEED_SHA1, { now: 59, digits: 8 });
        const [result, err] = await verifyTotp(SEED_SHA1, code, { now: 89, window: 1, digits: 8 });
        expect(err).toBe(null);
        if (!result.valid) throw new Error('drift-window verification failed');
        void err;
    });

    it('rejects codes outside the window', async () => {
        const [codeAtStep0] = await totp(SEED_SHA1, { now: 59, digits: 8 });
        // At T=149 (step 4), step 0 is 4 steps away — outside window=1
        const [result] = await verifyTotp(SEED_SHA1, codeAtStep0, { now: 149, window: 1, digits: 8 });
        if (result.valid) throw new Error('far-future code accepted within narrow window');
    });
});

describe('otpauth:// URI handling', () => {

    it('parses a standard Google Authenticator URI', () => {
        const uri = 'otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example';
        const [p, err] = parseOtpauthUri(uri);
        expect(err).toBe(null);
        if (p.secret !== 'JBSWY3DPEHPK3PXP') throw new Error('secret mismatch');
        if (p.label !== 'Example:user@example.com') throw new Error(`label mismatch: ${p.label}`);
        if (p.issuer !== 'Example') throw new Error('issuer missing');
        if (p.algorithm !== 'SHA-1') throw new Error('default should be SHA-1');
        if (p.digits !== 6) throw new Error('default should be 6 digits');
        if (p.period !== 30) throw new Error('default should be 30s period');
    });

    it('builds a URI that roundtrips through parse', () => {
        const input = { label: 'Test:alice', secret: 'SECRET234', issuer: 'TestCorp', algorithm: 'SHA-256', digits: 8, period: 60 };
        const [uri, buildErr] = buildOtpauthUri(input);
        expect(buildErr).toBe(null);

        const [parsed, parseErr] = parseOtpauthUri(uri);
        expect(parseErr).toBe(null);
        if (parsed.secret !== 'SECRET234') throw new Error('secret lost');
        if (parsed.algorithm !== 'SHA-256') throw new Error('algorithm lost');
        if (parsed.digits !== 8) throw new Error('digits lost');
        if (parsed.period !== 60) throw new Error('period lost');
        if (parsed.issuer !== 'TestCorp') throw new Error('issuer lost');
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
            if (!(err instanceof Error)) throw new Error(`accepted '${bad}'`);
        }
    });

    it('full roundtrip: URI → secret → generate code at known time', async () => {
        const uri = 'otpauth://totp/Test:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Test';
        const [params] = parseOtpauthUri(uri);
        const secretBytes = new TextEncoder().encode(params.secret);
        const [code, genErr] = await totp(secretBytes, { now: 59, digits: 8, algorithm: params.algorithm });
        expect(genErr).toBe(null);
        if (code.length !== 8) throw new Error('unexpected code length');
    });
});
