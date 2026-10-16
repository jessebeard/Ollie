/**
 * Unified Argon2id KDF Chain with HKDF Domain Separation.
 *
 * Implements Format v4 cryptographic key derivation:
 * MasterKey = Argon2id(password, salt, passes=3, memorySize=65536, parallelism=1)
 *
 * Sub-keys are expanded via HKDF-Expand (RFC 5869 / HMAC-SHA-256):
 * - aesKey:     32 bytes (info: 'ollie/v4/aes-key')
 * - aesIV:      12 bytes (info: 'ollie/v4/aes-iv')
 * - stcSeed:    32 bytes (info: 'ollie/v4/stc-matrix')
 * - costSeed:   32 bytes (info: 'ollie/v4/cost-perturb')
 */
import { deriveArgon2id } from '../../vendor/argon2/index.js';
import { importHmacKey, signBytes } from './hmac.js';

const HASH_LEN = 32; // SHA-256 digest length

/**
 * RFC 5869 HKDF-Expand using HMAC-SHA-256.
 *
 * @param {Uint8Array} prk - Pseudorandom key (master key, min 32 bytes)
 * @param {string|Uint8Array} info - Context and application specific information
 * @param {number} length - Desired output length in bytes
 * @returns {Promise<[Uint8Array|null, Error|null]>}
 */
export async function hkdfExpand(prk, info, length) {
    if (!(prk instanceof Uint8Array) || prk.length < 16) {
        return [null, new Error('hkdf-expand: PRK must be at least 16 bytes')];
    }
    if (!Number.isInteger(length) || length <= 0 || length > 255 * HASH_LEN) {
        return [null, new Error('hkdf-expand: invalid length')];
    }

    const infoBytes = typeof info === 'string'
        ? new TextEncoder().encode(info)
        : (info instanceof Uint8Array ? info : new Uint8Array(0));

    const [hmacKey, keyErr] = await importHmacKey(prk);
    if (keyErr) return [null, keyErr];

    const n = Math.ceil(length / HASH_LEN);
    const okm = new Uint8Array(n * HASH_LEN);
    let previousT = new Uint8Array(0);

    for (let i = 1; i <= n; i++) {
        // T(i) = HMAC(PRK, T(i-1) | info | i)
        const input = new Uint8Array(previousT.length + infoBytes.length + 1);
        input.set(previousT, 0);
        input.set(infoBytes, previousT.length);
        input[input.length - 1] = i;

        const [t, signErr] = await signBytes(hmacKey, input);
        if (signErr) return [null, signErr];

        okm.set(t, (i - 1) * HASH_LEN);
        previousT = /** @type {any} */ (t);
    }

    return [okm.slice(0, length), null];
}

/**
 * Derives all Format v4 cryptographic and steganographic keys from password and salt.
 *
 * @param {string|Uint8Array} password - Master password
 * @param {Uint8Array} salt - 16-byte CSPRNG salt
 * @param {Object} [options]
 * @param {number} [options.passes=3]
 * @param {number} [options.memorySize=65536] - 64 MB
 * @param {number} [options.parallelism=1]
 * @returns {Promise<[{masterKey: Uint8Array, aesKey: Uint8Array, aesIV: Uint8Array, stcSeed: Uint8Array, costSeed: Uint8Array}|null, Error|null]>}
 */
export async function deriveStegoKeys(password, salt, options = {}) {
    if (!password || (typeof password !== 'string' && !(password instanceof Uint8Array))) {
        return [null, new Error('kdf-chain: valid password required')];
    }
    if (!(salt instanceof Uint8Array) || salt.length < 8) {
        return [null, new Error('kdf-chain: salt must be at least 8 bytes')];
    }

    try {
        const masterKey = await deriveArgon2id({
            password,
            salt,
            passes: options.passes || 3,
            memorySize: options.memorySize || 65536,
            parallelism: options.parallelism || 1,
            tagLength: 32
        });

        const [aesKey, aesKeyErr] = await hkdfExpand(masterKey, 'ollie/v4/aes-key', 32);
        if (aesKeyErr) return [null, aesKeyErr];

        const [aesIV, aesIVErr] = await hkdfExpand(masterKey, 'ollie/v4/aes-iv', 12);
        if (aesIVErr) return [null, aesIVErr];

        const [stcSeed, stcSeedErr] = await hkdfExpand(masterKey, 'ollie/v4/stc-matrix', 32);
        if (stcSeedErr) return [null, stcSeedErr];

        const [costSeed, costSeedErr] = await hkdfExpand(masterKey, 'ollie/v4/cost-perturb', 32);
        if (costSeedErr) return [null, costSeedErr];

        return [{
            masterKey,
            aesKey,
            aesIV,
            stcSeed,
            costSeed
        }, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}
