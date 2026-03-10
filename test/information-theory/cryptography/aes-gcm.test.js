import { describe, it, expect } from '../../utils/test-runner.js';
import { Encryption } from '../../../src/information-theory/cryptography/aes-gcm.js';
import { KeyDerivation } from '../../../src/information-theory/cryptography/pbkdf2.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('Encryption (Property-Based Tests)', () => {

    async function getTestKey(password, saltBytes) {
        const [key, kErr] = await KeyDerivation.deriveKey(password, saltBytes);
        if (kErr) throw kErr;
        return key;
    }

    it('Property: Symmetry (encrypt then decrypt yields original data)', async () => {
        // Fuzz across strings of length 1-200, and byte arrays of length 1-2048
        await assertProperty(
            [Arbitrary.string(8, 32), Arbitrary.byteArray(16, 16), Arbitrary.byteArray(1, 1000)],
            async (password, salt, plaintextBytes) => {
                const key = await getTestKey(password, salt);

                const [encrypted, encErr] = await Encryption.encrypt(plaintextBytes, key);
                expect(encErr).toEqual(null);

                const [decrypted, decErr] = await Encryption.decrypt(encrypted.ciphertext, key, encrypted.iv);
                expect(decErr).toEqual(null);

                // Ensure data hasn't mutated
                expect(decrypted.length).toBe(plaintextBytes.length);
                for (let i = 0; i < plaintextBytes.length; i++) {
                    if (decrypted[i] !== plaintextBytes[i]) return false;
                }
                return true;
            },
            50 // Run 50 random fuzzing iterations
        );
    });

    it('Property: Incorrect Key Rejection', async () => {
        await assertProperty(
            [Arbitrary.string(8, 16), Arbitrary.string(8, 16), Arbitrary.byteArray(16, 16), Arbitrary.byteArray(10, 500)],
            async (pass1, pass2, salt, plaintextBytes) => {
                // Ignore statistically improbable collisions
                if (pass1 === pass2) return true;

                const key1 = await getTestKey(pass1, salt);
                const key2 = await getTestKey(pass2, salt);

                const [encrypted, encErr] = await Encryption.encrypt(plaintextBytes, key1);
                expect(encErr).toEqual(null);

                // Using wrong key should strictly return an error tuple, not throw.
                const [decrypted, error] = await Encryption.decrypt(encrypted.ciphertext, key2, encrypted.iv);
                expect(decrypted).toEqual(null);
                expect(error !== null).toBe(true);

                return true;
            },
            50
        );
    });

    it('Property: Ciphertext Tamper Resistance', async () => {
        await assertProperty(
            [Arbitrary.string(8, 32), Arbitrary.byteArray(16, 16), Arbitrary.byteArray(10, 1000), Arbitrary.positiveInteger(99)],
            async (password, salt, plaintextBytes, randomInt) => {
                const key = await getTestKey(password, salt);

                const [encrypted, encErr] = await Encryption.encrypt(plaintextBytes, key);
                expect(encErr).toEqual(null);

                // Tamper with a random byte in the ciphertext
                const tampered = new Uint8Array(encrypted.ciphertext);
                const tamperIndex = randomInt % tampered.length;
                tampered[tamperIndex] ^= 0xFF; // Flip all bits

                // AES-GCM must strictly reject tampered ciphertexts via the error tuple
                const [decrypted, error] = await Encryption.decrypt(tampered, key, encrypted.iv);
                expect(decrypted).toEqual(null);
                expect(error !== null).toBe(true);

                return true;
            },
            50
        );
    });
    it('Property: Unique IV & Identical Decryption per pass', async () => {
        await assertProperty(
            [Arbitrary.string(8, 32), Arbitrary.byteArray(16, 16), Arbitrary.byteArray(10, 1000)],
            async (password, salt, plaintextBytes) => {
                const key = await getTestKey(password, salt);

                const [enc1, err1] = await Encryption.encrypt(plaintextBytes, key);
                const [enc2, err2] = await Encryption.encrypt(plaintextBytes, key);

                expect(err1).toEqual(null);
                expect(err2).toEqual(null);

                // IVs must be unique even with identical plaintexts and keys
                let ivMatch = true;
                for (let i = 0; i < enc1.iv.length; i++) {
                    if (enc1.iv[i] !== enc2.iv[i]) {
                        ivMatch = false;
                        break;
                    }
                }
                expect(ivMatch).toBe(false);

                // But both must decrypt identically back to the source plaintext
                const [dec1, errDec1] = await Encryption.decrypt(enc1.ciphertext, key, enc1.iv);
                const [dec2, errDec2] = await Encryption.decrypt(enc2.ciphertext, key, enc2.iv);

                expect(errDec1).toBeNull();
                expect(errDec2).toBeNull();

                expect(dec1.byteLength).toBe(plaintextBytes.length);
                expect(dec2.byteLength).toBe(plaintextBytes.length);

                for (let i = 0; i < plaintextBytes.length; i++) {
                    if (dec1[i] !== plaintextBytes[i]) return false;
                    if (dec2[i] !== plaintextBytes[i]) return false;
                }

                return true;
            },
            20
        );
    });
});
