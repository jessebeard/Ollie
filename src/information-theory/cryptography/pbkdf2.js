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
     * @param {boolean} [options.allowLegacy] - Permit iteration counts below the OWASP floor (default true)
     * @returns {Promise<[CryptoKey|null, Error|null]>} Tuple with derived key or error
     */
    static async deriveKey(password, salt, options = {}) {
        try {
            const iterations = this.resolveIterations(options.iterations, {
                allowLegacy: options.allowLegacy !== undefined ? options.allowLegacy : true,
                ...options
            });
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
     * @param {boolean} [options.allowLegacy] - Permit iteration counts below the OWASP floor (default true)
     * @returns {Promise<[Uint8Array|null, Error|null]>} Raw derived bytes tuple
     */
    static async deriveRawBits(password, salt, options = {}) {
        try {
            const iterations = this.resolveIterations(options.iterations, {
                allowLegacy: options.allowLegacy !== undefined ? options.allowLegacy : true,
                ...options
            });
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
     * Validates and normalizes an iteration count. Enforces a strict floor of 600,000.
     *
     * @param {number} [iterations]
     * @param {Object} [options]
     * @param {boolean} [options.allowLegacy=false]
     * @returns {number|Error} Resolved iteration count, or Error when invalid
     */
    static resolveIterations(iterations, options = {}) {
        if (iterations === undefined || iterations === null) {
            return this.ITERATIONS;
        }
        if (!Number.isInteger(iterations)) {
            return new Error(`Invalid PBKDF2 iteration count: ${iterations}`);
        }
        if (options.allowLegacy) {
            if (iterations < 1 || iterations > 10000000) {
                return new Error(`Invalid PBKDF2 iteration count: ${iterations}`);
            }
            return iterations;
        }
        if (iterations < this.ITERATIONS || iterations > 10000000) {
            return new Error(`Invalid PBKDF2 iteration count: ${iterations} (must be between ${this.ITERATIONS} and 10,000,000)`);
        }
        return iterations;
    }

    /**
     * Measures client hardware performance for PBKDF2 and calculates
     * recommended iteration count to meet a target execution duration (default 500ms).
     * Strictly enforces a hard floor of 600,000 iterations and ceiling of 10,000,000.
     *
     * @param {Object} [options]
     * @param {number} [options.targetMs=500] - Desired derivation duration in milliseconds
     * @param {number} [options.sampleIterations=100000] - Calibration iteration sample
     * @returns {Promise<[{ sampleElapsedMs: number, sampleIterations: number, recommendedIterations: number, estimatedUnlockMs: number }|null, Error|null]>}
     */
    static async benchmark(options = {}) {
        const targetMs = options.targetMs || 500;
        const sampleIterations = options.sampleIterations || 100000;
        const testSalt = new Uint8Array(16).fill(0x5A);
        const testPassword = 'benchmark-calibration-pass';

        const [cryptoObj, cryptoErr] = getCrypto();
        if (cryptoErr) return [null, cryptoErr];

        try {
            const encoder = new TextEncoder();
            const passwordBytes = encoder.encode(testPassword);
            const baseKey = await cryptoObj.subtle.importKey(
                'raw',
                passwordBytes,
                'PBKDF2',
                false,
                ['deriveKey']
            );

            const start = performance.now();
            await cryptoObj.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: testSalt,
                    iterations: sampleIterations,
                    hash: 'SHA-256'
                },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );
            const elapsed = performance.now() - start;

            const itersPerMs = sampleIterations / Math.max(elapsed, 0.1);
            const calculated = Math.round((itersPerMs * targetMs) / 50000) * 50000;
            const recommended = Math.min(10000000, Math.max(this.ITERATIONS, calculated));

            return [{
                sampleElapsedMs: Math.round(elapsed),
                sampleIterations,
                recommendedIterations: recommended,
                estimatedUnlockMs: Math.round(recommended / itersPerMs)
            }, null];
        } catch (e) {
            return [null, e instanceof Error ? e : new Error(String(e))];
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
