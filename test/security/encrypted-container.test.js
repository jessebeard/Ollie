import { describe, it, expect } from '../utils/test-runner.js';
import { sealContainer, unsealContainer } from '../../src/information-theory/steganography/encrypted-container.js';

const PASSWORD = 'opaque-container-test-pw';
const KDF_OPTS = { memorySize: 64, passes: 1 };

function makeFields(overrides = {}) {
    return {
        magic: 'F5SG',
        version: 4,
        flags: 0,
        k: 2,
        eccProfile: 'Extreme',
        threshold: 2,
        totalCarriers: 3,
        metaLen: 0,
        payloadLen: 5,
        bodyCRC32: 12345,
        originalLength: 100,
        blockCount: 4,
        metadataJSON: '{"filename":"vault.json"}',
        payload: new Uint8Array([1, 2, 3, 4, 5]),
        ...overrides
    };
}

describe('opaque encrypted container (Format v4)', () => {

    it('seal then unseal recovers fields and payload byte-exact', async () => {
        const fields = makeFields();
        const [wire, sealErr] = await sealContainer(PASSWORD, fields, { kdfOpts: KDF_OPTS });
        expect(sealErr).toBe(null);
        expect(wire).toBeInstanceOf(Uint8Array);
        expect(wire.length).toBeGreaterThanOrEqual(16 + 16);

        const [unsealed, unsealErr] = await unsealContainer(PASSWORD, wire, { kdfOpts: KDF_OPTS });
        expect(unsealErr).toBe(null);
        expect(unsealed.fields.magic).toBe(fields.magic);
        expect(unsealed.fields.version).toBe(fields.version);
        expect(Array.from(unsealed.fields.payload)).toEqual(Array.from(fields.payload));
    });

    it('wrong password returns error/null (GCM auth failure), never partial output', async () => {
        const [wire] = await sealContainer(PASSWORD, makeFields(), { kdfOpts: KDF_OPTS });
        const [result, err] = await unsealContainer('wrong-password', wire, { kdfOpts: KDF_OPTS });
        expect(result).toBe(null);
        expect(err instanceof Error).toBe(true);
    });

    it('tampered ciphertext returns error/null', async () => {
        const [wire] = await sealContainer(PASSWORD, makeFields(), { kdfOpts: KDF_OPTS });
        const corrupted = Uint8Array.from(wire);
        corrupted[Math.floor(corrupted.length / 2)] ^= 0xFF;
        const [result, err] = await unsealContainer(PASSWORD, corrupted, { kdfOpts: KDF_OPTS });
        expect(result).toBe(null);
        expect(err instanceof Error).toBe(true);
    });

    it('salt is unique per seal operation', async () => {
        const salts = new Set();
        for (let i = 0; i < 20; i++) {
            const [wire] = await sealContainer(PASSWORD, makeFields(), { kdfOpts: KDF_OPTS });
            salts.add(Array.from(wire.slice(0, 16)).join(','));
        }
        expect(salts.size).toBe(20);
    });
});
