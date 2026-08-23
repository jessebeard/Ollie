import { describe, it, expect } from '../utils/test-runner.js';
import {
    MANIFEST_FORMAT,
    MANIFEST_VERSION,
    createManifest,
    canonicalManifestBytes,
    verifyManifest,
    bindChunkRecords,
    validateManifestStructure
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
});
