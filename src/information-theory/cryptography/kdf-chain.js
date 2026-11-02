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
import { WorkerPool } from '../../utils/concurrency/worker-pool.js';

let sharedKdfPool = null;

export function getKdfPool() {
    if (!sharedKdfPool) {
        sharedKdfPool = new WorkerPool({
            workerScript: new URL('./kdf.worker.js', import.meta.url),
            maxWorkers: 1,
            fallbackHandler: async (action, payload) => {
                if (action === 'derive-argon2id') {
                    const key = await deriveArgon2id(payload);
                    return [key, null];
                }
                return [null, new Error(`kdf fallback: unrecognized action "${action}"`)];
            }
        });
    }
    return sharedKdfPool;
}

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
 * RFC 5869 HKDF-Extract using HMAC-SHA-256.
 *
 * @param {Uint8Array} salt - Optional salt value (defaults to HashLen zeros if empty)
 * @param {Uint8Array} ikm - Input keying material
 * @returns {Promise<[Uint8Array|null, Error|null]>} PRK (32 bytes)
 */
export async function hkdfExtract(salt, ikm) {
    if (!(ikm instanceof Uint8Array) || ikm.length === 0) {
        return [null, new Error('hkdf-extract: IKM must be a non-empty Uint8Array')];
    }
    const saltBytes = (salt instanceof Uint8Array && salt.length > 0)
        ? salt
        : new Uint8Array(HASH_LEN);

    const [hmacKey, keyErr] = await importHmacKey(saltBytes);
    if (keyErr) return [null, keyErr];

    const [prk, signErr] = await signBytes(hmacKey, ikm);
    if (signErr) return [null, signErr];

    return [prk, null];
}

/**
 * Derives Format v4.1 carrier master key and steganographic matrix/cost seeds from password and carrierSalt.
 *
 * @param {string|Uint8Array} password - Master password
 * @param {Uint8Array} carrierSalt - 32-byte canonical carrier salt
 * @param {Object} [options]
 * @returns {Promise<[{masterKey: Uint8Array, stcSeed: Uint8Array, costSeed: Uint8Array}|null, Error|null]>}
 */
export async function deriveCarrierMasterKey(password, carrierSalt, options = {}) {
    if (!password || (typeof password !== 'string' && !(password instanceof Uint8Array))) {
        return [null, new Error('kdf-chain: valid password required')];
    }
    if (!(carrierSalt instanceof Uint8Array) || carrierSalt.length < 16) {
        return [null, new Error('kdf-chain: carrierSalt must be at least 16 bytes')];
    }

    try {
        const kdfPayload = {
            password,
            salt: carrierSalt,
            passes: options.passes || 3,
            memorySize: options.memorySize || 65536,
            parallelism: options.parallelism || 1,
            tagLength: 32
        };

        let masterKey;
        if (options.allowWorkerPassword && options.multithreaded !== false) {
            const pool = getKdfPool();
            const [kdfRes, kdfErr] = await pool.dispatch('derive-argon2id', kdfPayload);
            if (kdfErr) return [null, kdfErr];
            masterKey = kdfRes;
        } else {
            masterKey = await deriveArgon2id(kdfPayload);
        }

        const [stcSeed, stcSeedErr] = await hkdfExpand(masterKey, 'ollie/v4.1/stc-matrix', 32);
        if (stcSeedErr) return [null, stcSeedErr];

        const [costSeed, costSeedErr] = await hkdfExpand(masterKey, 'ollie/v4.1/cost-seed', 32);
        if (costSeedErr) return [null, costSeedErr];

        return [{
            masterKey,
            stcSeed,
            costSeed
        }, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Derives Format v4.1 envelope encryption keys from masterKey and fresh envelopeSalt.
 *
 * @param {Uint8Array} masterKey - 32-byte master key from deriveCarrierMasterKey()
 * @param {Uint8Array} envelopeSalt - 16-byte fresh CSPRNG envelope salt
 * @returns {Promise<[{prkEnv: Uint8Array, aesKey: Uint8Array, aesIV: Uint8Array}|null, Error|null]>}
 */
export async function deriveEnvelopeKeysV41(masterKey, envelopeSalt) {
    if (!(masterKey instanceof Uint8Array) || masterKey.length < 16) {
        return [null, new Error('kdf-chain: masterKey must be at least 16 bytes')];
    }
    if (!(envelopeSalt instanceof Uint8Array) || envelopeSalt.length < 8) {
        return [null, new Error('kdf-chain: envelopeSalt must be at least 8 bytes')];
    }

    try {
        const [prkEnv, prkErr] = await hkdfExtract(envelopeSalt, masterKey);
        if (prkErr) return [null, prkErr];

        const [aesKey, aesKeyErr] = await hkdfExpand(prkEnv, 'ollie/v4.1/aes-key', 32);
        if (aesKeyErr) return [null, aesKeyErr];

        const [aesIV, aesIVErr] = await hkdfExpand(prkEnv, 'ollie/v4.1/aes-iv', 12);
        if (aesIVErr) return [null, aesIVErr];

        return [{
            prkEnv,
            aesKey,
            aesIV
        }, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Derives complete Format v4.1 stego and envelope keys.
 *
 * @param {string|Uint8Array} password - Master password
 * @param {Uint8Array} carrierSalt - 32-byte carrier salt
 * @param {Uint8Array} [envelopeSalt] - Optional 16-byte envelope salt
 * @param {Object} [options] - KDF options
 * @returns {Promise<[{masterKey: Uint8Array, stcSeed: Uint8Array, costSeed: Uint8Array, aesKey: Uint8Array|null, aesIV: Uint8Array|null, prkEnv: Uint8Array|null}|null, Error|null]>}
 */
export async function deriveStegoKeysV41(password, carrierSalt, envelopeSalt = null, options = {}) {
    const [carrierKeys, cErr] = await deriveCarrierMasterKey(password, carrierSalt, options);
    if (cErr) return [null, cErr];

    let envelopeKeys = null;
    if (envelopeSalt) {
        const [envKeys, envErr] = await deriveEnvelopeKeysV41(carrierKeys.masterKey, envelopeSalt);
        if (envErr) return [null, envErr];
        envelopeKeys = envKeys;
    }

    return [{
        masterKey: carrierKeys.masterKey,
        stcSeed: carrierKeys.stcSeed,
        costSeed: carrierKeys.costSeed,
        aesKey: envelopeKeys ? envelopeKeys.aesKey : null,
        aesIV: envelopeKeys ? envelopeKeys.aesIV : null,
        prkEnv: envelopeKeys ? envelopeKeys.prkEnv : null
    }, null];
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
 * @param {boolean} [options.multithreaded=true]
 * @param {boolean} [options.allowWorkerPassword]
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
        const kdfPayload = {
            password,
            salt,
            passes: options.passes || 3,
            memorySize: options.memorySize || 65536,
            parallelism: options.parallelism || 1,
            tagLength: 32
        };

        let masterKey;
        if (options.allowWorkerPassword && options.multithreaded !== false) {
            const pool = getKdfPool();
            const [kdfRes, kdfErr] = await pool.dispatch('derive-argon2id', kdfPayload);
            if (kdfErr) return [null, kdfErr];
            masterKey = kdfRes;
        } else {
            masterKey = await deriveArgon2id(kdfPayload);
        }

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
