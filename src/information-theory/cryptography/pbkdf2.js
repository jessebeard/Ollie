/**
 * KeyDerivation - Handles password-based key derivation
 * Uses PBKDF2 with SHA-256
 */
import { getCrypto } from './crypto-provider.js';

export class KeyDerivation {

    /**
     * OWASP-aligned default (600k SHA-256). Recorded per-vault in the KDF
     * block, so raising this never breaks existing vaults; only new saves
     * adopt the stronger parameter.
     */
    static ITERATIONS = 600000;

    static SALT_SIZE = 16;

    /**
     * Derives a CryptoKey from a password and salt using PBKDF2
     *
     * @param {string} password - User password
     * @param {Uint8Array} salt - Salt (16 bytes recommended)
     * @param {Object} [options]
     * @param {number} [options.iterations] - PBKDF2 iteration count (defaults to ITERATIONS)
     * @returns {Promise<[CryptoKey|null, Error|null]>} Tuple with derived key or error
     */
    static async deriveKey(password, salt, options = {}) {
        try {
            const iterations = this.resolveIterations(options.iterations);
            if (iterations instanceof Error) return [null, iterations];

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
                    salt: /** @type {BufferSource} */ (salt),
                    iterations: iterations,
                    hash: 'SHA-256'
                },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            return [key, null];
        } catch (e) {
            return [null, e];
        }
    }

    /**
     * Derives raw key material of arbitrary length (unlike deriveKey, which
     * produces an AES-GCM CryptoKey). Needed when derived bytes feed a
     * different algorithm, e.g. HMAC manifest authentication.
     *
     * @param {string} password
     * @param {Uint8Array} salt
     * @param {Object} [options]
     * @param {number} [options.iterations]
     * @param {number} [options.bits] - Multiple of 8, minimum 256 (default 256)
     * @returns {Promise<[Uint8Array|null, Error|null]>} Raw derived bytes tuple
     */
    static async deriveRawBits(password, salt, options = {}) {
        try {
            const iterations = this.resolveIterations(options.iterations);
            if (iterations instanceof Error) return [null, iterations];

            const bits = Number.isInteger(options.bits) && options.bits >= 256 && options.bits % 8 === 0
                ? options.bits
                : 256;

            const [cryptoObj, cryptoErr] = getCrypto();
            if (cryptoErr) return [null, cryptoErr];

            const baseKey = await cryptoObj.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveBits']
            );

            const derived = await cryptoObj.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: /** @type {BufferSource} */ (salt),
                    iterations,
                    hash: 'SHA-256'
                },
                baseKey,
                bits
            );

            return [new Uint8Array(derived), null];
        } catch (e) {
            return [null, e instanceof Error ? e : new Error(String(e))];
        }
    }

    /**
     * Validates and normalizes an iteration count.
     *
     * @param {number} [iterations]
     * @returns {number|Error} Resolved iteration count, or Error when invalid
     */
    static resolveIterations(iterations) {
        if (iterations === undefined || iterations === null) {
            return this.ITERATIONS;
        }
        if (!Number.isInteger(iterations) || iterations < 1) {
            return new Error(`Invalid PBKDF2 iteration count: ${iterations}`);
        }
        return iterations;
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
