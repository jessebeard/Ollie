import { createRequire } from 'module';
import { describe, it, expect } from '../../utils/test-runner.js';
import { KeyDerivation } from '../../../src/core/crypto/key-derivation.js';

// Helper to get crypto
function getCrypto() {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        return crypto;
    }
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

const cryptoGlobal = getCrypto();

describe('KeyDerivation', () => {
    it('should derive a CryptoKey from password and salt', async () => {
        const password = 'test-password';
        const salt = new Uint8Array(16);
        cryptoGlobal.getRandomValues(salt);

        const key = await KeyDerivation.deriveKey(password, salt);

        expect(key).toBeDefined();
        expect(key.type).toBe('secret');
        expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('should produce different keys for different salts', async () => {
        const password = 'test-password';
        const salt1 = new Uint8Array(16);
        const salt2 = new Uint8Array(16);

        cryptoGlobal.getRandomValues(salt1);
        cryptoGlobal.getRandomValues(salt2);

        const key1 = await KeyDerivation.deriveKey(password, salt1);
        const key2 = await KeyDerivation.deriveKey(password, salt2);

        // Export keys to compare
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

        expect(different).toBe(true);
    });

    it('should produce same key for same password and salt', async () => {
        const password = 'test-password';
        const salt = new Uint8Array(16);
        cryptoGlobal.getRandomValues(salt);

        const key1 = await KeyDerivation.deriveKey(password, salt);
        const key2 = await KeyDerivation.deriveKey(password, salt);

        const raw1 = await cryptoGlobal.subtle.exportKey('raw', key1);
        const raw2 = await cryptoGlobal.subtle.exportKey('raw', key2);

        const arr1 = new Uint8Array(raw1);
        const arr2 = new Uint8Array(raw2);

        let same = true;
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) {
                same = false;
                break;
            }
        }

        expect(same).toBe(true);
    });

    it('should generate random salt', () => {
        const salt1 = KeyDerivation.generateSalt();
        const salt2 = KeyDerivation.generateSalt();

        expect(salt1.length).toBe(16);
        expect(salt2.length).toBe(16);

        let different = false;
        for (let i = 0; i < salt1.length; i++) {
            if (salt1[i] !== salt2[i]) {
                different = true;
                break;
            }
        }

        expect(different).toBe(true);
    });
});
