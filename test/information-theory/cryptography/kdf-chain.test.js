import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import {
    hkdfExpand,
    hkdfExtract,
    deriveStegoKeys,
    deriveCarrierMasterKey,
    deriveEnvelopeKeysV41,
    deriveStegoKeysV41
} from '../../../src/information-theory/cryptography/kdf-chain.js';

describe('Format v4 KDF Chain & HKDF-Expand', () => {
    it('hkdfExpand expands PRK to arbitrary requested lengths deterministically', async () => {
        const prk = new Uint8Array(32);
        for (let i = 0; i < 32; i++) prk[i] = i * 3;

        const [out16, err16] = await hkdfExpand(prk, 'test/info', 16);
        expect(err16).toBe(null);
        expect(out16.length).toBe(16);

        const [out64, err64] = await hkdfExpand(prk, 'test/info', 64);
        expect(err64).toBe(null);
        expect(out64.length).toBe(64);

        // Prefix match property of HKDF-Expand
        expect(Array.from(out64.slice(0, 16))).toEqual(Array.from(out16));
    });

    it('hkdfExpand produces distinct keys for distinct info labels', async () => {
        const prk = new Uint8Array(32).fill(42);
        const [k1] = await hkdfExpand(prk, 'label/alpha', 32);
        const [k2] = await hkdfExpand(prk, 'label/beta', 32);

        expect(Array.from(k1)).not.toEqual(Array.from(k2));
    });

    it('Metamorphic MR: domain separation across arbitrary PRKs', async () => {
        await assertProperty(
            [Arbitrary.byteArray(32, 32)],
            async (prk) => {
                const [kAes] = await hkdfExpand(prk, 'format-v4/aes-256-gcm/key', 32);
                const [kStc] = await hkdfExpand(prk, 'format-v4/stc/submatrix-seed', 32);
                const [kCost] = await hkdfExpand(prk, 'format-v4/juniward/anti-sca-seed', 32);

                expect(Array.from(kAes)).not.toEqual(Array.from(kStc));
                expect(Array.from(kStc)).not.toEqual(Array.from(kCost));
                expect(Array.from(kAes)).not.toEqual(Array.from(kCost));
            },
            30
        );
    });

    it('deriveStegoKeys derives complete subkey suite from password and salt', async () => {
        const password = 'vault-master-password-123';
        const salt = new Uint8Array(16).fill(7);

        const [keys, err] = await deriveStegoKeys(password, salt, { memorySize: 64, passes: 1 });
        expect(err).toBe(null);
        expect(keys.masterKey.length).toBe(32);
        expect(keys.aesKey.length).toBe(32);
        expect(keys.aesIV.length).toBe(12);
        expect(keys.stcSeed.length).toBe(32);
        expect(keys.costSeed.length).toBe(32);

        // Verify mutual independence of derived keys
        expect(Array.from(keys.aesKey)).not.toEqual(Array.from(keys.stcSeed));
        expect(Array.from(keys.stcSeed)).not.toEqual(Array.from(keys.costSeed));
    });

    it('Metamorphic MR: salt sensitivity produces distinct stego subkeys', async () => {
        const password = 'identical-password-test';
        const salt1 = new Uint8Array(16).fill(1);
        const salt2 = new Uint8Array(16).fill(2);

        const [keys1, err1] = await deriveStegoKeys(password, salt1, { memorySize: 64, passes: 1 });
        const [keys2, err2] = await deriveStegoKeys(password, salt2, { memorySize: 64, passes: 1 });

        expect(err1).toBe(null);
        expect(err2).toBe(null);
        expect(Array.from(keys1.aesKey)).not.toEqual(Array.from(keys2.aesKey));
        expect(Array.from(keys1.stcSeed)).not.toEqual(Array.from(keys2.stcSeed));
        expect(Array.from(keys1.costSeed)).not.toEqual(Array.from(keys2.costSeed));
    });

    it('Property: deriveStegoKeys is strictly deterministic for identical inputs', async () => {
        const password = 'determinism-check';
        const salt = new Uint8Array(16).fill(42);

        const [runA] = await deriveStegoKeys(password, salt, { memorySize: 64, passes: 1 });
        const [runB] = await deriveStegoKeys(password, salt, { memorySize: 64, passes: 1 });

        expect(Array.from(runA.masterKey)).toEqual(Array.from(runB.masterKey));
        expect(Array.from(runA.aesKey)).toEqual(Array.from(runB.aesKey));
        expect(Array.from(runA.aesIV)).toEqual(Array.from(runB.aesIV));
        expect(Array.from(runA.stcSeed)).toEqual(Array.from(runB.stcSeed));
        expect(Array.from(runA.costSeed)).toEqual(Array.from(runB.costSeed));
    });

    it('fails safely when invalid inputs are provided', async () => {
        const [keys1, err1] = await deriveStegoKeys('', new Uint8Array(16));
        expect(keys1).toBe(null);
        expect(err1 instanceof Error).toBe(true);

        const [keys2, err2] = await deriveStegoKeys('password', new Uint8Array(4)); // too short salt
        expect(keys2).toBe(null);
        expect(err2 instanceof Error).toBe(true);
    });

    it('Format v4.1: hkdfExtract extracts uniformly distributed PRK from salt and IKM', async () => {
        const salt = new Uint8Array(16).fill(0x11);
        const ikm = new Uint8Array(32).fill(0x22);

        const [prk, err] = await hkdfExtract(salt, ikm);
        expect(err).toBe(null);
        expect(prk instanceof Uint8Array).toBe(true);
        expect(prk.length).toBe(32);

        // Determinism check
        const [prk2] = await hkdfExtract(salt, ikm);
        expect(Array.from(prk)).toEqual(Array.from(prk2));

        // Sensitivity check
        const [prkDiff] = await hkdfExtract(new Uint8Array(16).fill(0x33), ikm);
        expect(Array.from(prk)).not.toEqual(Array.from(prkDiff));
    });

    it('Format v4.1: deriveStegoKeysV41 decouples carrier master keys from envelope keys', async () => {
        const password = 'vault-decoupled-password';
        const carrierSalt = new Uint8Array(32).fill(0xAA);
        const envelopeSalt1 = new Uint8Array(16).fill(0x01);
        const envelopeSalt2 = new Uint8Array(16).fill(0x02);

        // Derive keys for embedding 1
        const [keys1, err1] = await deriveStegoKeysV41(password, carrierSalt, envelopeSalt1, { memorySize: 64, passes: 1 });
        expect(err1).toBe(null);

        // Derive keys for embedding 2 on SAME image (same carrierSalt, fresh envelopeSalt)
        const [keys2, err2] = await deriveStegoKeysV41(password, carrierSalt, envelopeSalt2, { memorySize: 64, passes: 1 });
        expect(err2).toBe(null);

        // MasterKey and Stego Seeds MUST be invariant for the same image and password
        expect(Array.from(keys1.masterKey)).toEqual(Array.from(keys2.masterKey));
        expect(Array.from(keys1.stcSeed)).toEqual(Array.from(keys2.stcSeed));
        expect(Array.from(keys1.costSeed)).toEqual(Array.from(keys2.costSeed));

        // Envelope encryption keys MUST be unique (Zero Nonce Reuse Invariant)
        expect(Array.from(keys1.aesKey)).not.toEqual(Array.from(keys2.aesKey));
        expect(Array.from(keys1.aesIV)).not.toEqual(Array.from(keys2.aesIV));
        expect(Array.from(keys1.prkEnv)).not.toEqual(Array.from(keys2.prkEnv));
    });

    it('Format v4.1: deriveCarrierMasterKey derives carrier stego keys without envelope salt', async () => {
        const password = 'carrier-only-password';
        const carrierSalt = new Uint8Array(32).fill(0xBB);

        const [carrierKeys, err] = await deriveCarrierMasterKey(password, carrierSalt, { memorySize: 64, passes: 1 });
        expect(err).toBe(null);
        expect(carrierKeys.masterKey.length).toBe(32);
        expect(carrierKeys.stcSeed.length).toBe(32);
        expect(carrierKeys.costSeed.length).toBe(32);

        // Derive envelope keys later from extracted envelopeSalt
        const envelopeSalt = new Uint8Array(16).fill(0xCC);
        const [envKeys, envErr] = await deriveEnvelopeKeysV41(carrierKeys.masterKey, envelopeSalt);
        expect(envErr).toBe(null);
        expect(envKeys.aesKey.length).toBe(32);
        expect(envKeys.aesIV.length).toBe(12);
        expect(envKeys.prkEnv.length).toBe(32);
    });
});
