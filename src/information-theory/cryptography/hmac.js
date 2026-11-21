/**
 * HMAC-SHA256 message authentication via WebCrypto.
 *
 * Used to authenticate carrier manifests: the MAC key is derived from the
 * master password (separate PBKDF2 salt), so tampering with any manifest-
 * covered field is detectable before decryption is attempted.
 */

import { getCrypto } from './crypto-provider.js';

const HMAC_IMPORT_FAILED = 'hmac: key material must be a non-empty Uint8Array';

function isBytes(value) {
    return value instanceof Uint8Array && value.length > 0;
}

/**
 * Imports raw key material as an HMAC-SHA256 signing key.
 *
 * @param {Uint8Array} rawBytes - Non-empty key bytes (any length >= 1)
 * @returns {Promise<[CryptoKey|null, Error|null]>} Result tuple
 */
export async function importHmacKey(rawBytes) {
    if (!isBytes(rawBytes)) {
        return [null, new Error(HMAC_IMPORT_FAILED)];
    }

    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr) return [null, cryptoErr];

    try {
        const key = await cryptoObj.subtle.importKey(
            'raw',
            /** @type {BufferSource} */ (rawBytes),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
        );
        return [key, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Computes the HMAC-SHA256 digest of data under key.
 *
 * @param {CryptoKey} key - Key from importHmacKey()
 * @param {Uint8Array} data
 * @returns {Promise<[Uint8Array|null, Error|null]>} 32-byte digest tuple
 */
export async function signBytes(key, data) {
    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr || !key) {
        return [null, new Error('hmac: invalid signing key or unavailable WebCrypto')];
    }

    try {
        const digest = await cryptoObj.subtle.sign('HMAC', key, /** @type {BufferSource} */ (data));
        return [new Uint8Array(digest), null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Constant-time verification of data under key against mac.
 * A malformed mac (wrong length, wrong type) verifies FALSE rather than
 * erroring: authentication failure is an expected outcome, not an
 * infrastructure problem.
 *
 * @param {CryptoKey} key
 * @param {Uint8Array} data
 * @param {Uint8Array} mac
 * @returns {Promise<[boolean|null, Error|null]>} Result tuple
 */
export async function verifyBytes(key, data, mac) {
    if (!(mac instanceof Uint8Array)) {
        return [false, null];
    }

    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr || !key) {
        return [false, null];
    }

    const [expected, err] = await signBytes(key, data);
    if (err) return [null, err];

    // Length gate first: subtle.verify throws on mismatched lengths.
    if (expected.length !== mac.length) {
        return [false, null];
    }

    try {
        const valid = await cryptoObj.subtle.verify('HMAC', key, /** @type {BufferSource} */ (mac), /** @type {BufferSource} */ (data));
        return [valid === true, null];
    } catch {
        return [false, null];
    }
}
