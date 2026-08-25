/**
 * Cauchy MDS erasure codec (Wave I Cycle 1 GREEN).
 *
 * Encoding splits data into k equal-length stripes (zero padded) and emits n
 * coded chunks, one per row of the k-column Cauchy matrix over GF(256):
 *
 *     M[i][j] = inverse(x_i XOR y_j),  y_j = j+1,  x_i = k+1+i
 *
 * The x/y sets are disjoint and nonzero, so every square submatrix of M is
 * nonsingular (Cauchy property) and ANY k chunks reconstruct the data.
 *
 * Field arithmetic comes from gf256.js (GF(2^8), poly 0x11D). Both entry
 * points report predictable failures as [value|null, Error|null] tuples and
 * never throw.
 */
import { gfMultiply, gfInverse } from './gf256.js';

/**
 * Cauchy matrix entry for chunk row `rowIndex` (0-based chunk index) and
 * stripe column `stripeIndex`. Encoder and decoder must agree on this layout.
 *
 * @param {number} rowIndex
 * @param {number} stripeIndex
 * @param {number} k
 * @returns {number}
 */
function cauchyEntry(rowIndex, stripeIndex, k) {
    return gfInverse(((k + 1 + rowIndex) ^ (stripeIndex + 1)) & 0xFF);
}

/**
 * Inverts a k x k GF(256) matrix via Gauss-Jordan elimination against an
 * augmented identity: pivot search downward through remaining rows, scale by
 * the pivot inverse, eliminate in every other row.
 *
 * @param {number[][]} a
 * @param {number} k
 * @returns {number[][]|null} inverse, or null when singular
 */
function invertGf256Matrix(a, k) {
    const aug = [];
    for (let r = 0; r < k; r++) {
        const row = new Array(2 * k).fill(0);
        for (let c = 0; c < k; c++) row[c] = a[r][c];
        row[k + r] = 1;
        aug.push(row);
    }
    for (let col = 0; col < k; col++) {
        let pivot = -1;
        for (let r = col; r < k; r++) {
            if (aug[r][col] !== 0) { pivot = r; break; }
        }
        if (pivot === -1) return null;
        if (pivot !== col) {
            const tmp = aug[pivot];
            aug[pivot] = aug[col];
            aug[col] = tmp;
        }
        const scale = gfInverse(aug[col][col]);
        for (let c = 0; c < 2 * k; c++) aug[col][c] = gfMultiply(scale, aug[col][c]);
        for (let r = 0; r < k; r++) {
            if (r === col || aug[r][col] === 0) continue;
            const factor = aug[r][col];
            for (let c = 0; c < 2 * k; c++) {
                aug[r][c] ^= gfMultiply(factor, aug[col][c]);
            }
        }
    }
    const inv = [];
    for (let r = 0; r < k; r++) inv.push(aug[r].slice(k));
    return inv;
}

/**
 * Encodes data into n Cauchy-coded chunks such that any k suffice to
 * reconstruct. Stripe j is data.slice(j*S, (j+1)*S) zero-padded to
 * S = ceil(len/k); chunk i is SUM_j M[i][j]*stripe_j.
 *
 * @param {Uint8Array} data
 * @param {{k: number, n: number}} options
 * @returns {[Array<{index: number, data: Uint8Array}>|null, Error|null]}
 */
export function encodeErasure(data, options) {
    if (!(data instanceof Uint8Array) || data.length < 1) {
        return [null, new Error('cauchy-ec: data must be a Uint8Array of at least one byte')];
    }
    const k = options ? options.k : undefined;
    const n = options ? options.n : undefined;
    if (!Number.isInteger(k) || k < 1) {
        return [null, new Error('cauchy-ec: k must be an integer >= 1')];
    }
    if (!Number.isInteger(n)) {
        return [null, new Error('cauchy-ec: n must be an integer')];
    }
    if (n < k) {
        return [null, new Error('cauchy-ec: n must not be smaller than k')];
    }
    if (k + n > 255) {
        return [null, new Error('cauchy-ec: k + n must not exceed 255')];
    }

    const stripeLen = Math.ceil(data.length / k);
    const stripes = [];
    for (let j = 0; j < k; j++) {
        const stripe = new Uint8Array(stripeLen);
        stripe.set(data.subarray(j * stripeLen, (j + 1) * stripeLen));
        stripes.push(stripe);
    }

    const chunks = [];
    for (let i = 0; i < n; i++) {
        const out = new Uint8Array(stripeLen);
        for (let j = 0; j < k; j++) {
            const coeff = cauchyEntry(i, j, k);
            const stripe = stripes[j];
            for (let p = 0; p < stripeLen; p++) {
                out[p] ^= gfMultiply(coeff, stripe[p]);
            }
        }
        chunks.push({ index: i, data: out });
    }
    return [chunks, null];
}

/**
 * Reconstructs the original data from at least k erasure-coded chunks. Chunks
 * are validated (indices in range, uniform length ceil(size/k), no
 * duplicates), the k lowest-indexed survivors select a k x k Cauchy
 * submatrix, which is inverted over GF(256) to recover the stripes; their
 * concatenation truncated to `size` bytes is the original data.
 *
 * @param {Array<{index: number, data: Uint8Array}>} chunks
 * @param {{k: number, n: number, size: number}} options
 * @returns {[Uint8Array|null, Error|null]}
 */
export function decodeErasure(chunks, options) {
    const k = options ? options.k : undefined;
    const n = options ? options.n : undefined;
    const size = options ? options.size : undefined;
    if (!Number.isInteger(k) || k < 1) {
        return [null, new Error('cauchy-ec: k must be an integer >= 1')];
    }
    if (!Number.isInteger(n) || n < k) {
        return [null, new Error('cauchy-ec: n must be an integer >= k')];
    }
    if (k + n > 255) {
        return [null, new Error('cauchy-ec: k + n must not exceed 255')];
    }
    if (!Number.isInteger(size) || size < 1) {
        return [null, new Error('cauchy-ec: size must be an integer >= 1')];
    }
    if (!Array.isArray(chunks)) {
        return [null, new Error('cauchy-ec: chunks must be an array')];
    }

    const stripeLen = Math.ceil(size / k);
    const seen = new Set();
    for (const chunk of chunks) {
        if (chunk === null || typeof chunk !== 'object') {
            return [null, new Error('cauchy-ec: each chunk must be an object')];
        }
        const index = chunk.index;
        if (!Number.isInteger(index) || index < 0 || index >= n) {
            return [null, new Error('cauchy-ec: chunk index out of range')];
        }
        if (!(chunk.data instanceof Uint8Array) || chunk.data.length !== stripeLen) {
            return [null, new Error('cauchy-ec: chunk data length must equal ceil(size / k)')];
        }
        seen.add(index);
    }
    if (seen.size !== chunks.length) {
        return [null, new Error('cauchy-ec: duplicate chunk index')];
    }
    if (chunks.length < k) {
        return [null, new Error('cauchy-ec: at least k chunks are required')];
    }

    const chosen = chunks.slice().sort((a, b) => a.index - b.index).slice(0, k);
    const a = [];
    for (const chunk of chosen) {
        const row = [];
        for (let c = 0; c < k; c++) row.push(cauchyEntry(chunk.index, c, k));
        a.push(row);
    }
    const inv = invertGf256Matrix(a, k);
    if (inv === null) {
        return [null, new Error('cauchy-ec: selected chunk rows form a singular matrix')];
    }

    const out = new Uint8Array(k * stripeLen);
    for (let j = 0; j < k; j++) {
        for (let r = 0; r < k; r++) {
            const coeff = inv[j][r];
            if (coeff === 0) continue;
            const data = chosen[r].data;
            for (let p = 0; p < stripeLen; p++) {
                out[j * stripeLen + p] ^= gfMultiply(coeff, data[p]);
            }
        }
    }
    return [out.slice(0, size), null];
}

/**
 * Plans a spread-first stripe allocation across carriers.
 *
 * Physical constraint: each carrier file stores exactly ONE F5 container,
 * so assigning more than one coded stripe to the same carrier is loss by
 * construction (the second embedding would overwrite the first on
 * write-back). This planner therefore hands out AT MOST one stripe per
 * carrier and maximizes the number of participating carriers, which
 * maximizes file-level loss tolerance (any n - threshold carriers may be
 * lost).
 *
 * Selection: candidate stripe sizes are the distinct usable capacities
 * (capacity minus margin). A carrier participates at candidate S iff its
 * usable space holds one full stripe of S. Among feasible candidates
 * (participants >= threshold, S >= ceil(payloadSize / threshold)) the
 * planner picks the largest participant count, breaking ties toward the
 * larger stripe size. n is capped by the Cauchy ceiling of 255 -
 * threshold, keeping the highest-capacity carriers when trimming.
 *
 * @param {number[]} capacities
 * @param {{threshold: number, margin?: number, payloadSize?: number}} options
 * @returns {[{counts: number[], stripeSize: number, n: number, maxPayload: number}|null, Error|null]}
 */
export function planErasureAllocation(capacities, options) {
    const threshold = options ? options.threshold : undefined;
    if (!Number.isInteger(threshold) || threshold < 1) {
        return [null, new Error('cauchy-ec: threshold must be an integer >= 1')];
    }
    let margin = 512;
    if (options && options.margin !== undefined) {
        margin = options.margin;
        if (!Number.isInteger(margin) || margin < 0) {
            return [null, new Error('cauchy-ec: margin must be an integer >= 0')];
        }
    }
    const payloadSize = options && options.payloadSize !== undefined ? options.payloadSize : undefined;
    if (payloadSize !== undefined && (!Number.isInteger(payloadSize) || payloadSize < 1)) {
        return [null, new Error('cauchy-ec: payloadSize must be an integer >= 1')];
    }
    if (!Array.isArray(capacities) || capacities.length < 1) {
        return [null, new Error('cauchy-ec: capacities must be a non-empty array')];
    }
    for (const cap of capacities) {
        if (!Number.isInteger(cap) || cap < 1) {
            return [null, new Error('cauchy-ec: each capacity must be an integer > 0')];
        }
    }

    // No plan can exist once the k + n <= 255 field ceiling bites.
    const countCeiling = 255 - threshold;
    if (countCeiling < threshold) {
        return [null, new Error('cauchy-ec: threshold leaves no room under the 255-chunk ceiling')];
    }

    const usable = capacities.map((cap) => Math.max(0, cap - margin));
    const requiredStripe = payloadSize !== undefined ? Math.ceil(payloadSize / threshold) : 0;
    const cutoff = Math.max(margin, requiredStripe);

    const candidates = Array.from(new Set(usable.filter((u) => u > 0))).sort((a, b) => b - a);

    let best = null;
    for (const s of candidates) {
        if (s < cutoff) break;

        const eligible = [];
        for (let i = 0; i < usable.length; i++) {
            if (usable[i] >= s) eligible.push(i);
        }
        if (eligible.length > countCeiling) {
            eligible.sort((a, b) => usable[b] - usable[a]);
            eligible.length = countCeiling;
        }
        if (eligible.length < threshold) continue;

        if (!best || eligible.length > best.n || (eligible.length === best.n && s > best.stripeSize)) {
            best = {
                eligible,
                stripeSize: s,
                n: eligible.length,
                maxPayload: threshold * s
            };
        }
    }

    if (!best) {
        return [null, new Error(
            'cauchy-ec: capacity set cannot host a threshold-' + threshold +
            (payloadSize !== undefined ? ' plan for a ' + payloadSize + '-byte payload' : '')
        )];
    }

    const counts = capacities.map((_cap, i) => (best.eligible.includes(i) ? 1 : 0));
    return [{
        counts,
        stripeSize: best.stripeSize,
        n: best.n,
        maxPayload: best.maxPayload
    }, null];
}
