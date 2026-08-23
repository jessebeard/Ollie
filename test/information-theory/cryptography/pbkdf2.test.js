import { describe, it, expect } from '../../utils/test-runner.js';
import { KeyDerivation } from '../../../src/information-theory/cryptography/pbkdf2.js';
import { Encryption } from '../../../src/information-theory/cryptography/aes-gcm.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

async function getCrypto() {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        return crypto;
    }
    // Node.js fallback: dynamic import to avoid breaking browser
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const nodeCrypto = require('crypto');

    return {
        subtle: (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) || {
            async exportKey(format, key) {
                if (format === 'raw') {
                    return key.keyData.buffer;
                }
                throw new Error('Unsupported format');
            }
        },
        getRandomValues: (arr) => {
            const bytes = nodeCrypto.randomBytes(arr.length);
            arr.set(bytes);
            return arr;
        }
    };
}

describe('KeyDerivation (Property-Based Tests)', () => {

    it('Property: Deterministic Derivation (same password & salt = same key)', async () => {
        const cryptoGlobal = await getCrypto();

        await assertProperty(
            [Arbitrary.string(8, 64), Arbitrary.byteArray(16, 16)],
            async (password, salt) => {
                // Duplicate the salt instances to ensure they aren't mutated
                const saltA = new Uint8Array(salt);
                const saltB = new Uint8Array(salt);

                const [key1, err1] = await KeyDerivation.deriveKey(password, saltA);
                expect(err1).toEqual(null);

                const [key2, err2] = await KeyDerivation.deriveKey(password, saltB);
                expect(err2).toEqual(null);

                // Keys are non-extractable; compare behaviorally.
                const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
                const [encResult, encErr] = await Encryption.encrypt(plaintext, key1);
                expect(encErr).toEqual(null);

                const [decrypted, decErr] = await Encryption.decrypt(encResult.ciphertext, key2, encResult.iv);
                if (decErr) return false;

                return decrypted.length === plaintext.length && decrypted.every((b, i) => b === plaintext[i]);
            },
            50
        );
    });

    it('Property: Salt Uniqueness and Influence (different salt = different key)', async () => {
        const cryptoGlobal = await getCrypto();

        await assertProperty(
            [Arbitrary.string(8, 64), Arbitrary.byteArray(16, 16), Arbitrary.byteArray(16, 16)],
            async (password, salt1, salt2) => {
                // Statistical collision check (extremely unlikely for random 16 bytes)
                let identicalSalts = true;
                for (let i = 0; i < 16; i++) {
                    if (salt1[i] !== salt2[i]) {
                        identicalSalts = false;
                        break;
                    }
                }
                if (identicalSalts) return true; // Skip invalid fuzz input

                const [key1, err1] = await KeyDerivation.deriveKey(password, salt1);
                expect(err1).toEqual(null);

                const [key2, err2] = await KeyDerivation.deriveKey(password, salt2);
                expect(err2).toEqual(null);

                // Different salts must yield behaviorally unrelated keys.
                const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
                const [encResult, encErr] = await Encryption.encrypt(plaintext, key1);
                expect(encErr).toEqual(null);

                const [, decErr] = await Encryption.decrypt(encResult.ciphertext, key2, encResult.iv);
                return decErr !== null && decErr !== undefined;
            },
            50
        );
    });

    it('Property: Salt Generation Uniqueness', async () => {
        await assertProperty(
            [], // No generative inputs needed, we are generating our own randomness internally
            async () => {
                const [salt1, err1] = KeyDerivation.generateSalt();
                expect(err1).toEqual(null);

                const [salt2, err2] = KeyDerivation.generateSalt();
                expect(err2).toEqual(null);

                expect(salt1.length).toBe(16);
                expect(salt2.length).toBe(16);

                let different = false;
                for (let i = 0; i < salt1.length; i++) {
                    if (salt1[i] !== salt2[i]) {
                        different = true;
                        break;
                    }
                }

                return different;
            },
            100 // 100 collision checks
        );
    });
});

describe('KeyDerivation.deriveRawBits', () => {
    it('derives deterministic raw key material of requested length', async () => {
        const salt = new Uint8Array(16).fill(7);
        const [a, errA] = await KeyDerivation.deriveRawBits('pw', salt, { iterations: 1000, bits: 256 });
        const [b, errB] = await KeyDerivation.deriveRawBits('pw', salt, { iterations: 1000, bits: 256 });

        if (errA || errB) throw new Error('deriveRawBits failed');
        expect(a instanceof Uint8Array && a.length === 32).toBe(true);
        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('differs by password, salt, and iteration count', async () => {
        const salt = new Uint8Array(16).fill(7);
        const [base] = await KeyDerivation.deriveRawBits('pw', salt, { iterations: 1000, bits: 256 });
        const [otherPw] = await KeyDerivation.deriveRawBits('px', salt, { iterations: 1000, bits: 256 });
        const [otherSalt] = await KeyDerivation.deriveRawBits('pw', new Uint8Array(16).fill(8), { iterations: 1000, bits: 256 });
        const [otherIter] = await KeyDerivation.deriveRawBits('pw', salt, { iterations: 1001, bits: 256 });

        for (const other of [otherPw, otherSalt, otherIter]) {
            expect(Array.from(base)).not.toEqual(Array.from(other));
        }
    });
});
