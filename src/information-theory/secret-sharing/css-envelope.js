/**
 * Computationally Secure Secret Sharing (Krawczyk-style hybrid).
 *
 * A fresh random 256-bit data-encryption key (DEK) encrypts the payload once
 * under AES-256-GCM; the DEK itself is Shamir-split over GF(256) so any
 * `threshold` of `total` shares reconstructs it. Fewer than threshold shares
 * reveal nothing about the DEK beyond computational bounds, and every share
 * is a fixed 32-byte key share regardless of payload size.
 */
import { splitSecret, combineShares } from './gf-shamir.js';
import { getCrypto } from '../cryptography/crypto-provider.js';

function defaultRandom(n) {
    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr) throw cryptoErr;
    const out = new Uint8Array(n);
    cryptoObj.getRandomValues(out);
    return out;
}

/**
 * Seals a payload under a fresh random DEK and splits the DEK into shares.
 *
 * @param {Uint8Array} payload - Plaintext bytes (length >= 1)
 * @param {{threshold: number, total: number, random?: Function}} options
 *   options.random optionally supplies ALL randomness (DEK + polynomial
 *   coefficients) for reproducible tests.
 * @returns {Promise<[Object|null, Error|null]>} Result tuple:
 *   { envelope: {iv, ciphertext}, shares: [{index, data}] }
 */
export async function sealPayload(payload, options) {
    if (!(payload instanceof Uint8Array) || payload.length < 1) {
        return [null, new Error('css-envelope: payload must be a non-empty Uint8Array')];
    }

    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr) return [null, cryptoErr];

    const random = options && typeof options.random === 'function' ? options.random : defaultRandom;

    const dek = random(32);
    try {
        const [shares, splitErr] = await splitSecret(dek, options);
        if (splitErr) return [null, splitErr];

        const iv = cryptoObj.getRandomValues(new Uint8Array(12));
        const key = await cryptoObj.subtle.importKey(
            'raw',
            /** @type {BufferSource} */ (dek),
            'AES-GCM',
            false,
            ['encrypt']
        );
        const ciphertext = await cryptoObj.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            /** @type {BufferSource} */ (payload)
        );

        dek.fill(0);

        return [{
            envelope: { iv, ciphertext: new Uint8Array(ciphertext) },
            shares
        }, null];
    } catch (e) {
        dek.fill(0);
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Reconstructs the DEK from shares and authenticates the envelope back to
 * plaintext. Any failure - sub-threshold input, invalid indices, tampered
 * ciphertext, or foreign shares - yields an Error tuple; garbage output is
 * impossible because GCM authentication gates the result.
 *
 * @param {Object} envelope - {iv: Uint8Array(12), ciphertext: Uint8Array}
 * @param {Array<{index: number, data: Uint8Array}>} shares
 * @param {{threshold?: number, total?: number}} [options]
 * @returns {Promise<[Uint8Array|null, Error|null]>}
 */
export async function openEnvelope(envelope, shares, options = {}) {
    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr) return [null, cryptoErr];

    if (!envelope || !(envelope.iv instanceof Uint8Array) || envelope.iv.length !== 12 ||
        !(envelope.ciphertext instanceof Uint8Array) || envelope.ciphertext.length < 16) {
        return [null, new Error('css-envelope: malformed envelope')];
    }

    const [dek, combineErr] = combineShares(shares, options);
    if (combineErr) return [null, new Error(`css-envelope: ${combineErr.message}`)];

    try {
        const key = await cryptoObj.subtle.importKey(
            'raw',
            /** @type {BufferSource} */ (dek),
            'AES-GCM',
            false,
            ['decrypt']
        );
        const decrypted = await cryptoObj.subtle.decrypt(
            { name: 'AES-GCM', iv: /** @type {BufferSource} */ (envelope.iv) },
            key,
            /** @type {BufferSource} */ (envelope.ciphertext)
        );
        return [new Uint8Array(decrypted), null];
    } catch {
        return [null, new Error('css-envelope: decryption failed - wrong shares or tampered envelope')];
    } finally {
        dek.fill(0);
    }
}
