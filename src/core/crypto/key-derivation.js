/**
 * KeyDerivation - Handles password-based key derivation
 * Uses PBKDF2 with SHA-256
 */
export class KeyDerivation {
    
    static ITERATIONS = 100000;

    static SALT_SIZE = 16;

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
     * Derives a CryptoKey from a password and salt using PBKDF2
     * 
     * @param {string} password - User password
     * @param {Uint8Array} salt - Salt (16 bytes recommended)
     * @returns {Promise<CryptoKey>} Derived key suitable for AES-GCM
     */
    static async deriveKey(password, salt) {
        const cryptoObj = this.getCrypto();

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
            {
                name: 'AES-GCM',
                length: 256 
            },
            true, 
            ['encrypt', 'decrypt']
        );

        return key;
    }

    /**
     * Generates a random salt
     * 
     * @returns {Uint8Array} Random salt
     */
    static generateSalt() {
        const cryptoObj = this.getCrypto();
        const salt = new Uint8Array(this.SALT_SIZE);
        cryptoObj.getRandomValues(salt);
        return salt;
    }
}
