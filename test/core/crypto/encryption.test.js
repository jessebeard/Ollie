import { describe, it, expect } from '../../utils/test-runner.js';
import { Encryption } from '../../../src/core/crypto/encryption.js';
import { KeyDerivation } from '../../../src/core/crypto/key-derivation.js';

describe('Encryption', () => {
    // Helper to get a key
    async function getTestKey() {
        const password = 'test-password';
        const salt = KeyDerivation.generateSalt();
        return await KeyDerivation.deriveKey(password, salt);
    }

    it('should encrypt data returning ciphertext, iv, and salt', async () => {
        const key = await getTestKey();
        const data = new Uint8Array([1, 2, 3, 4, 5]);

        const result = await Encryption.encrypt(data, key);

        expect(result).toBeDefined();
        expect(result.ciphertext).toBeDefined();
        expect(result.iv).toBeDefined();
        expect(result.iv.length).toBe(12); // Standard GCM IV length
        expect(result.ciphertext.byteLength).toBeGreaterThan(data.length); // Includes tag
    });

    it('should decrypt data correctly', async () => {
        const key = await getTestKey();
        const data = new Uint8Array([10, 20, 30, 40, 50]);

        const encrypted = await Encryption.encrypt(data, key);
        const decrypted = await Encryption.decrypt(encrypted.ciphertext, key, encrypted.iv);

        expect(decrypted).toBeDefined();
        expect(decrypted.length).toBe(data.length);
        expect(decrypted[0]).toBe(10);
        expect(decrypted[4]).toBe(50);
    });

    it('should fail to decrypt with wrong key', async () => {
        const key1 = await getTestKey();
        const key2 = await getTestKey(); // Different salt -> different key
        const data = new Uint8Array([1, 2, 3]);

        const encrypted = await Encryption.encrypt(data, key1);

        let error = null;
        try {
            await Encryption.decrypt(encrypted.ciphertext, key2, encrypted.iv);
        } catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
    });

    it('should fail to decrypt with modified ciphertext', async () => {
        const key = await getTestKey();
        const data = new Uint8Array([1, 2, 3]);

        const encrypted = await Encryption.encrypt(data, key);

        // Tamper with ciphertext
        const tampered = new Uint8Array(encrypted.ciphertext);
        tampered[0] ^= 1;

        let error = null;
        try {
            await Encryption.decrypt(tampered, key, encrypted.iv);
        } catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
    });
});
