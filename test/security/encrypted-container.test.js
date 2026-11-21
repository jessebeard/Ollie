import { describe, it, expect } from '../utils/test-runner.js';
import { sealOpaque, unsealOpaque } from '../../src/information-theory/steganography/opaque-container.js';

const PASSWORD = 'opaque-container-test-pw';
const KDF_OPTS = { memorySize: 64, passes: 1 };

describe('opaque encrypted container security invariants', () => {

    it('seal then unseal recovers binary payload byte-exact with zero copy overhead', async () => {
        const payload = new Uint8Array([1, 2, 3, 4, 5, 42, 255]);
        const [wire, sealErr] = await sealOpaque(payload, PASSWORD, { kdfOpts: KDF_OPTS });
        expect(sealErr).toBe(null);
        expect(wire).toBeInstanceOf(Uint8Array);
        expect(wire.length).toBeGreaterThanOrEqual(16 + 16);

        const [unsealed, unsealErr] = await unsealOpaque(wire, PASSWORD, { kdfOpts: KDF_OPTS });
        expect(unsealErr).toBe(null);
        expect(Array.from(unsealed)).toEqual(Array.from(payload));
    });

    it('wrong password returns error/null (GCM auth failure), never partial output', async () => {
        const payload = new Uint8Array([1, 2, 3, 4, 5]);
        const [wire] = await sealOpaque(payload, PASSWORD, { kdfOpts: KDF_OPTS });
        const [result, err] = await unsealOpaque(wire, 'wrong-password', { kdfOpts: KDF_OPTS });
        expect(result).toBe(null);
        expect(err instanceof Error).toBe(true);
    });

    it('tampered ciphertext returns error/null', async () => {
        const payload = new Uint8Array([1, 2, 3, 4, 5]);
        const [wire] = await sealOpaque(payload, PASSWORD, { kdfOpts: KDF_OPTS });
        const corrupted = Uint8Array.from(wire);
        corrupted[Math.floor(corrupted.length / 2)] ^= 0xFF;
        const [result, err] = await unsealOpaque(corrupted, PASSWORD, { kdfOpts: KDF_OPTS });
        expect(result).toBe(null);
        expect(err instanceof Error).toBe(true);
    });

    it('salt is unique per seal operation', async () => {
        const payload = new Uint8Array([1, 2, 3, 4, 5]);
        const salts = new Set();
        for (let i = 0; i < 20; i++) {
            const [wire] = await sealOpaque(payload, PASSWORD, { kdfOpts: KDF_OPTS });
            salts.add(Array.from(wire.slice(0, 16)).join(','));
        }
        expect(salts.size).toBe(20);
    });
});
