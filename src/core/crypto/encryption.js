/**
 * Encryption - Handles AES-GCM encryption/decryption
 */
export class Encryption {
    // Standard IV length for GCM is 12 bytes (96 bits)
    static IV_LENGTH = 12;

    /**
     * Gets the crypto object (browser or Node.js)
     * @private
     */
    static getCrypto() {
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            throw new Error('Web Crypto API is not available. Please use a modern browser or Node.js 19+.');
        }
        return {
            subtle: crypto.subtle,
            getRandomValues: crypto.getRandomValues.bind(crypto)
        };
    }

    /**
     * Encrypts data using AES-GCM
     * 
     * @param {Uint8Array} data - Data to encrypt
     * @param {CryptoKey} key - AES-GCM key
     * @returns {Promise<{ciphertext: ArrayBuffer, iv: Uint8Array}>}
     */
    static async encrypt(data, key) {
        const cryptoObj = this.getCrypto();
        const iv = new Uint8Array(this.IV_LENGTH);
        cryptoObj.getRandomValues(iv);

        const ciphertext = await cryptoObj.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            data
        );

        return {
            ciphertext: ciphertext,
            iv: iv
        };
    }

    /**
     * Decrypts data using AES-GCM
     * 
     * @param {ArrayBuffer|Uint8Array} ciphertext - Encrypted data (including tag)
     * @param {CryptoKey} key - AES-GCM key
     * @param {Uint8Array} iv - Initialization Vector
     * @returns {Promise<Uint8Array>} Decrypted data
     */
    static async decrypt(ciphertext, key, iv) {
        const cryptoObj = this.getCrypto();

        const decrypted = await cryptoObj.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            ciphertext
        );

        return new Uint8Array(decrypted);
    }
}
