import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import {
    MANIFEST_FORMAT,
    MANIFEST_VERSION,
    MANIFEST_TUPLE_LENGTH,
    createManifest,
    canonicalManifestBytes,
    verifyManifest,
    bindChunkRecords,
    validateManifestStructure,
    packManifest,
    unpackManifest
} from '../../src/information-theory/steganography/carrier-manifest.js';
import { crc32 } from '../../src/utils/crc32.js';

const PASSWORD = 'correct horse battery staple';

function chunkRecords(n) {
    return Array.from({ length: n }, (_, i) => ({
        index: i,
        checksum: crc32(new TextEncoder().encode(`chunk-${i}-payload`))
    }));
}

async function buildSample(overrides = {}) {
    const [manifest, err] = await createManifest({
        chunkSetId: '00000000-0000-4000-8000-000000000001',
        records: chunkRecords(3),
        revision: 7,
        password: PASSWORD,
        ...overrides
    });
    expect(err).toBe(null);
    return manifest;
}

describe('carrier manifest structure', () => {

    it('declares the frozen format identity', () => {
        expect(MANIFEST_FORMAT).toBe('ollie-manifest');
        expect(MANIFEST_VERSION).toBe(1);
    });

    it('builds a complete manifest with mac and kdf block', async () => {
        const m = await buildSample();

        if (m.format !== 'ollie-manifest' || m.version !== 1) throw new Error('bad format identity');
        if (m.chunkSetId !== '00000000-0000-4000-8000-000000000001') throw new Error('id lost');
        if (m.total !== 3 || !Array.isArray(m.entries) || m.entries.length !== 3) throw new Error('entries wrong');
        if (m.revision !== 7) throw new Error('revision lost');
        if (typeof m.created !== 'string') throw new Error('created missing');
        if (typeof m.mac !== 'string' || m.mac.length === 0) throw new Error('mac missing');
        if (!m.kdf || m.kdf.algo !== 'PBKDF2-SHA256' ||
            !Number.isInteger(m.kdf.iterations) || typeof m.kdf.salt !== 'string') {
            throw new Error('kdf block malformed');
        }
        for (let i = 0; i < 3; i++) {
            if (m.entries[i].index !== i) throw new Error('entry order must be ascending');
        }
    });
});

describe('carrier manifest canonical serialization', () => {

    it('is deterministic and excludes the mac field from MAC input', async () => {
        const m = await buildSample();
        const [a, errA] = canonicalManifestBytes(m);
        const [b, errB] = canonicalManifestBytes(m);
        expect(errA).toBe(null);
        expect(errB).toBe(null);

        expect(Array.from(a)).toEqual(Array.from(b));

        const text = new TextDecoder().decode(a);
        if (text.includes('"mac"')) throw new Error('mac must not cover itself');
        // Fixed key order pinned by spec section 6.3
        const order = ['format', 'version', 'chunkSetId', 'total', 'revision', 'created', 'entries', 'kdf'];
        let cursor = -1;
        for (const key of order) {
            const at = text.indexOf(`"${key}"`);
            if (at < cursor) throw new Error(`key "${key}" out of canonical order`);
            cursor = at;
        }
    });
});

describe('carrier manifest verification', () => {

    it('verifies under the correct password and rejects a wrong one', async () => {
        const m = await buildSample();

        const [ok, okErr] = await verifyManifest(m, PASSWORD);
        expect(okErr).toBe(null);
        expect(ok).toBe(true);

        const [bad] = await verifyManifest(m, 'wrong password');
        expect(bad).toBe(false);
    });

    it('fails closed when any protected field is tampered', async () => {
        const mutations = [
            (m) => { m.version = 2; },
            (m) => { m.chunkSetId = 'ffffffff-0000-4000-8000-000000000001'; },
            (m) => { m.total = 4; },
            (m) => { m.revision = 8; },
            (m) => { m.created = '1999-01-01T00:00:00.000Z'; },
            (m) => { m.entries[1].checksum = (m.entries[1].checksum + 1) >>> 0; },
            (m) => { m.kdf.iterations = m.kdf.iterations + 1; },
            (m) => { m.mac = m.mac.slice(0, -2) + (m.mac.endsWith('AA') ? 'BB' : 'AA'); }
        ];

        for (let i = 0; i < mutations.length; i++) {
            const m = await buildSample();
            mutations[i](m);
            // Rejection is either an explicit false or a tuple error from
            // structural validation - both are fail-closed outcomes.
            const [ok, verr] = await verifyManifest(m, PASSWORD);
            if (!(ok === false || (ok === null && verr instanceof Error))) {
                throw new Error(`mutation #${i} was accepted by verification`);
            }
        }
    });

    it('rejects structurally invalid manifests via tuple before MAC work', async () => {
        const base = await buildSample();

        const cases = [];
        cases.push({ ...base, format: 'other-format' });
        cases.push({ ...base, version: 99 });
        cases.push({ ...base, total: 0 });
        cases.push({ ...base, entries: [] });
        cases.push({
            ...base,
            kdf: { ...base.kdf, iterations: 100 }   // below enforced floor
        });
        cases.push({
            ...base,
            entries: [...base.entries].reverse()     // duplicate/out-of-order indices
        });
        cases.push({ ...base, mac: '' });

        for (const bad of cases) {
            if (validateManifestStructure(bad) === null) {
                throw new Error('structurally invalid manifest passed validation');
            }
            const [ok, err] = await verifyManifest(bad, PASSWORD);
            if (ok !== null && ok !== false) throw new Error('invalid manifest verified');
            if (!(err instanceof Error) && ok !== false) {
                throw new Error('expected tuple error or false, never silent success');
            }
        }

        if (validateManifestStructure(base) !== null) {
            throw new Error('valid manifest rejected by structural validation');
        }
    });
});

describe('carrier manifest chunk binding', () => {

    it('accepts records that match the manifest exactly', async () => {
        const m = await buildSample();
        const [bindErr] = bindChunkRecords(chunkRecords(3), m);
        expect(bindErr).toBe(null);
    });

    it('rejects mismatched checksums, indices, and counts', async () => {
        const m = await buildSample();

        const wrongChecksum = chunkRecords(3);
        wrongChecksum[2] = { index: 2, checksum: (wrongChecksum[2].checksum + 1) >>> 0 };
        const [, errChecksum] = bindChunkRecords(wrongChecksum, m);
        if (!(errChecksum instanceof Error)) throw new Error('checksum divergence accepted');

        const extraRecord = [...chunkRecords(3), { index: 3, checksum: 123 }];
        const [, errCount] = bindChunkRecords(extraRecord, m);
        if (!(errCount instanceof Error)) throw new Error('count mismatch accepted');

        const swapped = chunkRecords(3);
        swapped[0] = { index: 1, checksum: m.entries[0].checksum };
        const [, errIndex] = bindChunkRecords(swapped, m);
        if (!(errIndex instanceof Error)) throw new Error('index swap accepted');
    });

    describe('PBT & Metamorphic Tamper Resistance', () => {
        it('MR-manifest-tamper: flipping any character in the MAC causes verification failure', async () => {
            const m = await buildSample();
            const originalMac = m.mac;

            // Test characters that directly encode payload bytes (excluding the last partial padding char and '=')
            const maxPayloadChar = (originalMac.indexOf('=') !== -1)
                ? originalMac.indexOf('=') - 2
                : originalMac.length - 2;

            await assertProperty(
                [Arbitrary.integer(0, maxPayloadChar)],
                async (charPos) => {
                    // Mutate a single char in the hex/base64 MAC string
                    const corruptedChar = originalMac[charPos] === 'a' ? 'b' : 'a';
                    const corruptedMac = originalMac.slice(0, charPos) + corruptedChar + originalMac.slice(charPos + 1);
                    const corruptedManifest = { ...m, mac: corruptedMac };

                    const [verified, err] = await verifyManifest(corruptedManifest, PASSWORD);
                    expect(verified).toBe(false);
                },
                30
            );
        });

        it('Property: wrong password unconditionally fails verification', async () => {
            const m = await buildSample();
            await assertProperty(
                [Arbitrary.string(1, 30)],
                async (wrongPass) => {
                    if (wrongPass === PASSWORD) return;
                    const [verified] = await verifyManifest(m, wrongPass);
                    expect(verified).toBe(false);
                },
                30
            );
        });

        it('Property: tampering chunk records invalidates manifest verification', async () => {
            const m = await buildSample();
            await assertProperty(
                [Arbitrary.integer(0, 2), Arbitrary.integer(1, 1000)],
                async (entryIdx, delta) => {
                    const tamperedEntries = JSON.parse(JSON.stringify(m.entries));
                    tamperedEntries[entryIdx].checksum = (tamperedEntries[entryIdx].checksum + delta) >>> 0;
                    const tamperedManifest = { ...m, entries: tamperedEntries };

                    const [verified] = await verifyManifest(tamperedManifest, PASSWORD);
                    expect(verified).toBe(false);
                },
                30
            );
        });
    });

    describe('Format v4.1 positional array manifest serialization (Rule 16)', () => {
        it('packs and losslessly unpacks a manifest positional tuple', async () => {
            const m = await buildSample();
            const [tuple, packErr] = packManifest(m);
            expect(packErr).toBe(null);
            expect(Array.isArray(tuple)).toBe(true);
            expect(tuple.length).toBe(MANIFEST_TUPLE_LENGTH);

            // Invariant: tuple serialization contains zero labeled JSON dictionary keys
            const serialized = JSON.stringify(tuple);
            expect(serialized.includes('"format"')).toBe(false);
            expect(serialized.includes('"chunkSetId"')).toBe(false);
            expect(serialized.includes('"total"')).toBe(false);
            expect(serialized.includes('"entries"')).toBe(false);
            expect(serialized.includes('"checksum"')).toBe(false);
            expect(serialized.includes('"kdf"')).toBe(false);

            const [unpacked, unpackErr] = unpackManifest(tuple);
            expect(unpackErr).toBe(null);
            expect(unpacked.format).toBe(m.format);
            expect(unpacked.version).toBe(m.version);
            expect(unpacked.chunkSetId).toBe(m.chunkSetId);
            expect(unpacked.total).toBe(m.total);
            expect(unpacked.revision).toBe(m.revision);
            expect(unpacked.created).toBe(m.created);
            expect(unpacked.entries).toEqual(m.entries);
            expect(unpacked.kdf).toEqual(m.kdf);
            expect(unpacked.mac).toBe(m.mac);
        });

        it('verifies a manifest directly from its positional tuple', async () => {
            const m = await buildSample();
            const [tuple] = packManifest(m);
            const [verified, vErr] = await verifyManifest(tuple, PASSWORD);
            expect(vErr).toBe(null);
            expect(verified).toBe(true);

            const [bad] = await verifyManifest(tuple, 'wrong password');
            expect(bad).toBe(false);
        });

        it('fails closed when positional tuple is truncated or corrupted', () => {
            const truncated = ['ollie-manifest', 1, 'set-id'];
            const [res, err] = unpackManifest(truncated);
            expect(res).toBe(null);
            expect(err instanceof Error).toBe(true);

            const wrongType = ['ollie-manifest', 1, 12345, 3, 0, '2026-11-01', [], null, null, null, 'mac'];
            const [res2, err2] = unpackManifest(wrongType);
            expect(res2).toBe(null);
            expect(err2 instanceof Error).toBe(true);
        });
    });
});
