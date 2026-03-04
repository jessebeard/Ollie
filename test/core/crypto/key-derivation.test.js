import { describe, it, expect } from '../../utils/test-runner.js';
import { KeyDerivation } from '../../../src/core/crypto/key-derivation.js';
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

                const raw1 = await cryptoGlobal.subtle.exportKey('raw', key1);
                const raw2 = await cryptoGlobal.subtle.exportKey('raw', key2);

                const arr1 = new Uint8Array(raw1);
                const arr2 = new Uint8Array(raw2);

                if (arr1.length !== arr2.length) return false;

                for (let i = 0; i < arr1.length; i++) {
                    if (arr1[i] !== arr2[i]) return false;
                }

                return true;
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

                const raw1 = await cryptoGlobal.subtle.exportKey('raw', key1);
                const raw2 = await cryptoGlobal.subtle.exportKey('raw', key2);

                const arr1 = new Uint8Array(raw1);
                const arr2 = new Uint8Array(raw2);

                let different = false;
                for (let i = 0; i < arr1.length; i++) {
                    if (arr1[i] !== arr2[i]) {
                        different = true;
                        break;
                    }
                }

                if (!different) return false;

                return true;
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
