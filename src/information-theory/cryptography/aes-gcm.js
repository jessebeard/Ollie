/**
 * Encryption - Handles AES-GCM encryption/decryption
 */
import { getCrypto } from './crypto-provider.js';

export class Encryption {

    static IV_LENGTH = 12;

    /**
     * Encrypts data using AES-GCM
     * 
     * @param {Uint8Array} data - Data to encrypt
     * @param {CryptoKey} key - AES-GCM key
     * @returns {Promise<[{ciphertext: ArrayBuffer, iv: Uint8Array}, Error|null]>}
     */
    static async encrypt(data, key) {
        try {
            const [cryptoObj, cryptoErr] = getCrypto();
            if (cryptoErr) return [null, cryptoErr];

            const iv = new Uint8Array(this.IV_LENGTH);
            cryptoObj.getRandomValues(iv);

            const ciphertext = await cryptoObj.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            return [{ ciphertext, iv }, null];
        } catch (e) {
            return [null, e];
        }
    }

    /**
     * Decrypts data using AES-GCM
     * 
     * @param {ArrayBuffer|Uint8Array} ciphertext - Encrypted data (including tag)
     * @param {CryptoKey} key - AES-GCM key
     * @param {Uint8Array} iv - Initialization Vector
     * @returns {Promise<[Uint8Array|null, Error|null]>} Decrypted data tuple
     */
    static async decrypt(ciphertext, key, iv) {
        try {
            const [cryptoObj, cryptoErr] = getCrypto();
            if (cryptoErr) return [null, cryptoErr];

            const decrypted = await cryptoObj.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );

            return [new Uint8Array(decrypted), null];
        } catch (e) {
            return [null, e];
        }
    }
}
