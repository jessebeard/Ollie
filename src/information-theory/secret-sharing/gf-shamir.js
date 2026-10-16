/**
 * GF(256) Shamir secret sharing (Wave H2 Cycle 1 GREEN).
 *
 * Field arithmetic comes from gf256.js (GF(2^8), poly 0x11D, generator 2).
 * Splitting evaluates one random polynomial per secret byte; combination is
 * Lagrange interpolation at x = 0 restricted to the supplied shares.
 *
 * Both entry points report predictable failures as [value|null, Error|null]
 * tuples and never throw.
 */
import { gfMultiply, gfInverse } from './gf256.js';
import { getCrypto } from '../cryptography/crypto-provider.js';

function defaultRandom(n) {
    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr) throw cryptoErr;
    const out = new Uint8Array(n);
    cryptoObj.getRandomValues(out);
    return out;
}

/**
 * Splits a secret into `total` Shamir shares over GF(256) such that any
 * `threshold` shares reconstruct it. Share indices run 1..total (never 0,
 * which would leak the secret byte); each share's data holds the
 * y-coordinate of every per-byte polynomial. All randomness flows through
 * `options.random` when provided (one (threshold-1)*secret.length draw),
 * so identical generators yield identical shares.
 *
 * @param {Uint8Array} secret
 * @param {{threshold: number, total: number, random?: Function}} options
 * @returns {Promise<[Array<{index: number, data: Uint8Array}>|null, Error|null]>}
 */
export async function splitSecret(secret, options) {
    if (!(secret instanceof Uint8Array) || secret.length < 1) {
        return [null, new Error('gf-shamir: secret must be a Uint8Array of at least one byte')];
    }
    const threshold = options ? options.threshold : undefined;
    const total = options ? options.total : undefined;
    if (!Number.isInteger(threshold) || threshold < 1) {
        return [null, new Error('gf-shamir: threshold must be an integer >= 1')];
    }
    if (!Number.isInteger(total)) {
        return [null, new Error('gf-shamir: total must be an integer')];
    }
    if (threshold > total) {
        return [null, new Error('gf-shamir: threshold must not exceed total')];
    }
    if (total > 255) {
        return [null, new Error('gf-shamir: total must not exceed 255')];
    }
    const random = options && typeof options.random === 'function' ? options.random : defaultRandom;

    const length = secret.length;
    const span = threshold - 1;
    let coefficients = null;
    if (span > 0) {
        coefficients = random(span * length);
        if (!(coefficients instanceof Uint8Array) || coefficients.length < span * length) {
            return [null, new Error('gf-shamir: random source returned insufficient bytes')];
        }
    }

    const shares = [];
    for (let index = 1; index <= total; index++) {
        const data = new Uint8Array(length);
        for (let p = 0; p < length; p++) {
            const base = p * span;
            let acc = span > 0 ? coefficients[base + span - 1] : 0;
            for (let k = span - 1; k >= 1; k--) {
                acc = gfMultiply(acc, index) ^ coefficients[base + k - 1];
            }
            data[p] = gfMultiply(acc, index) ^ secret[p];
        }
        shares.push({ index, data });
    }
    return [shares, null];
}

/**
 * Reconstructs the secret from shares via Lagrange interpolation at x = 0
 * in GF(256). Rejects duplicate, zero, non-integer, and out-of-range
 * indices, mismatched data lengths, empty input, and sub-threshold input.
 *
 * Without an explicit `options.total`, indices are trusted only up to
 * min(255, 2 * threshold); passing the original split's `total` raises the
 * accepted index range accordingly.
 *
 * @param {Array<{index: number, data: Uint8Array}>} shares
 * @param {{threshold?: number, total?: number}} [options]
 * @returns {[Uint8Array|null, Error|null]}
 */
export function combineShares(shares, options = {}) {
    if (!Array.isArray(shares) || shares.length === 0) {
        return [null, new Error('gf-shamir: at least one share is required')];
    }
    const threshold = options.threshold === undefined ? shares.length : options.threshold;
    if (!Number.isInteger(threshold) || threshold < 1) {
        return [null, new Error('gf-shamir: threshold must be an integer >= 1')];
    }
    if (shares.length < threshold) {
        return [null, new Error(`gf-shamir: ${shares.length} shares cannot reach threshold ${threshold}`)];
    }
    let maxIndex = Number.isInteger(options.total) && options.total >= 1 ? options.total : 2 * threshold;
    if (maxIndex > 255) {
        maxIndex = 255;
    }

    let expectedLength = null;
    const seen = new Set();
    for (const share of shares) {
        if (!share || !Number.isInteger(share.index)) {
            return [null, new Error('gf-shamir: share index must be an integer')];
        }
        if (share.index < 1 || share.index > maxIndex) {
            return [null, new Error(`gf-shamir: share index ${share.index} is out of range`)];
        }
        if (seen.has(share.index)) {
            return [null, new Error(`gf-shamir: duplicate share index ${share.index}`)];
        }
        seen.add(share.index);
        if (!(share.data instanceof Uint8Array)) {
            return [null, new Error('gf-shamir: share data must be a Uint8Array')];
        }
        if (expectedLength === null) {
            expectedLength = share.data.length;
        } else if (share.data.length !== expectedLength) {
            return [null, new Error('gf-shamir: share data lengths do not match')];
        }
    }

    const count = shares.length;
    const secret = new Uint8Array(expectedLength);
    for (let i = 0; i < count; i++) {
        let weight = 1;
        for (let j = 0; j < count; j++) {
            if (j === i) continue;
            weight = gfMultiply(weight, gfMultiply(shares[j].index, gfInverse(shares[i].index ^ shares[j].index)));
        }
        for (let p = 0; p < expectedLength; p++) {
            secret[p] ^= gfMultiply(shares[i].data[p], weight);
        }
    }
    return [secret, null];
}
