/**
 * KeyDerivation - Handles password-based key derivation
 * Uses PBKDF2 with SHA-256
 */
export class KeyDerivation {
    // PBKDF2 iterations (100,000 is standard for good security)
    static ITERATIONS = 100000;

    // Salt size in bytes
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

        // Convert password to bytes
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);

        // Import password as a key
        const baseKey = await cryptoObj.subtle.importKey(
            'raw',
            passwordBytes,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive the actual encryption key
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
                length: 256 // 256-bit key
            },
            true, // extractable (for testing)
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
