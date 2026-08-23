/**
 * KeyDerivation - Handles password-based key derivation
 * Uses PBKDF2 with SHA-256
 */
import { getCrypto } from './crypto-provider.js';

export class KeyDerivation {

    static ITERATIONS = 100000;

    static SALT_SIZE = 16;

    /**
     * Derives a CryptoKey from a password and salt using PBKDF2
     * 
     * @param {string} password - User password
     * @param {Uint8Array} salt - Salt (16 bytes recommended)
     * @returns {Promise<[CryptoKey|null, Error|null]>} Tuple with derived key or error
     */
    static async deriveKey(password, salt) {
        try {
            const [cryptoObj, cryptoErr] = getCrypto();
            if (cryptoErr) return [null, cryptoErr];

            const encoder = new TextEncoder();
            const passwordBytes = encoder.encode(password);

            const baseKey = await cryptoObj.subtle.importKey(
                'raw',
                passwordBytes,
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const key = await cryptoObj.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: this.ITERATIONS,
                    hash: 'SHA-256'
                },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            return [key, null];
        } catch (e) {
            return [null, e];
        }
    }

    /**
     * Generates a random salt
     * 
     * @returns {[Uint8Array|null, Error|null]} Random salt or error
     */
    static generateSalt() {
        try {
            const [cryptoObj, cryptoErr] = getCrypto();
            if (cryptoErr) return [null, cryptoErr];

            const salt = new Uint8Array(this.SALT_SIZE);
            cryptoObj.getRandomValues(salt);
            return [salt, null];
        } catch (e) {
            return [null, e];
        }
    }
}
