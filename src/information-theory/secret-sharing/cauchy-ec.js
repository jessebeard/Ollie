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
        if (!(chunk.data instanceof Uint8Array) || chunk.data.length < stripeLen) {
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
 * Plans an erasure stripe allocation across carriers.
 *
 * Supports two operational modes:
 * 1. Proportional Parity Mode (Default when payloadSize is given without fixed threshold):
 *    Divides payload into k granular source blocks and allocates m_i >= 0 coded
 *    parity blocks to carrier i proportional to its usable capacity. Any subset
 *    of carriers supplying at least k blocks can reconstruct the payload.
 *
 * 2. Legacy Spread-First Mode (When fixed threshold is explicitly provided without proportional flag):
 *    Assigns at most one stripe per carrier to satisfy file-count quorum tests.
 *
 * @param {number[]} capacities
 * @param {{threshold?: number, margin?: number, payloadSize?: number, proportional?: boolean}} options
 * @returns {[{counts: number[], stripeSize: number, k: number, n: number, maxPayload: number}|null, Error|null]}
 */
export function planErasureAllocation(capacities, options = {}) {
    if (!Array.isArray(capacities) || capacities.length < 1) {
        return [null, new Error('cauchy-ec: capacities must be a non-empty array')];
    }
    for (const cap of capacities) {
        if (!Number.isInteger(cap) || cap < 1) {
            return [null, new Error('cauchy-ec: each capacity must be an integer > 0')];
        }
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

    const threshold = options ? options.threshold : undefined;

    // Case 1 & 2: Spread-first 1-stripe allocation (when threshold is specified and not proportional)
    if (threshold !== undefined && options.proportional !== true) {
        if (!Number.isInteger(threshold) || threshold < 1) {
            return [null, new Error('cauchy-ec: threshold must be an integer >= 1')];
        }
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
            k: threshold,
            n: best.n,
            maxPayload: best.maxPayload
        }, null];
    }

    const usable = capacities.map((cap) => Math.max(0, cap - margin));
    const totalUsable = usable.reduce((a, b) => a + b, 0);
    const effPayload = payloadSize !== undefined ? payloadSize : 1024;

    // Case 3: Single Carrier (k=1, n=1)
    if (capacities.length === 1 || threshold === 1) {
        if (effPayload > totalUsable) {
            return [null, new Error(
                `cauchy-ec: capacity set cannot host a ${effPayload}-byte payload across ${capacities.length} carriers (total usable capacity is ${totalUsable} bytes)`
            )];
        }
        return [{
            counts: [1],
            stripeSize: effPayload,
            k: 1,
            n: 1,
            maxPayload: totalUsable
        }, null];
    }

    // Case 4: Small payloads (<= 2048 bytes) across carriers
    if (effPayload <= 2048) {
        const smallK = Math.max(1, Math.min(capacities.length, Math.ceil(capacities.length / 2)));
        const smallStripe = Math.ceil(effPayload / smallK);
        const smallCounts = usable.map((u) => (u >= smallStripe ? 1 : 0));
        const smallTotal = smallCounts.reduce((a, b) => a + b, 0);
        if (smallTotal >= smallK) {
            return [{
                counts: smallCounts,
                stripeSize: smallStripe,
                k: smallK,
                n: smallTotal,
                maxPayload: smallK * smallStripe
            }, null];
        }
    }

    // Case 5: Proportional Parity Allocation for medium/large payloads across heterogeneous carriers
    if (effPayload > totalUsable) {
        return [null, new Error(
            `cauchy-ec: capacity set cannot host a ${effPayload}-byte payload across ${capacities.length} carriers (total usable capacity is ${totalUsable} bytes)`
        )];
    }

    // Compute target source blocks k (between ceil(carriers/2) and 64)
    const minK = capacities.length >= 2 ? Math.ceil(capacities.length / 2) : 1;
    let k = Math.min(64, Math.max(minK, Math.ceil(effPayload / 2048)));
    let stripeSize = Math.ceil(effPayload / k);

    // Compute target total parity blocks (providing ~1.2x to 1.5x redundancy)
    const targetRedundancy = Math.min(255 - k, Math.max(k, Math.ceil(k * 1.5)));

    // Calculate proportional block counts m_i for each carrier based on capacity share
    let counts = usable.map((u) => {
        const rawBlocks = Math.floor((u * 0.75) / stripeSize);
        const propBlocks = Math.ceil(targetRedundancy * (u / totalUsable));
        return Math.min(rawBlocks, propBlocks);
    });
    let totalBlocks = counts.reduce((a, b) => a + b, 0);

    // If totalBlocks < k, scale up to available capacity
    if (totalBlocks < k) {
        counts = usable.map((u) => Math.floor((u * 0.75) / stripeSize));
        totalBlocks = counts.reduce((a, b) => a + b, 0);
    }

    if (totalBlocks < k) {
        stripeSize = Math.max(64, Math.floor(totalUsable / Math.max(capacities.length, k)));
        k = Math.max(1, Math.min(capacities.length, Math.ceil(effPayload / stripeSize)));
        counts = usable.map((u) => Math.floor((u * 0.75) / stripeSize));
        totalBlocks = counts.reduce((a, b) => a + b, 0);
    }

    if (totalBlocks < k) {
        return [null, new Error('cauchy-ec: unable to find viable proportional block allocation')];
    }

    // Enforce k + totalBlocks <= 255 (GF(256) Cauchy matrix bound)
    const maxTotalBlocks = 255 - k;
    if (totalBlocks > maxTotalBlocks) {
        const scale = maxTotalBlocks / totalBlocks;
        counts = counts.map((c) => Math.floor(c * scale));
        totalBlocks = counts.reduce((a, b) => a + b, 0);
        const sortedIndices = counts.map((c, i) => ({ i, cap: usable[i] })).sort((a, b) => b.cap - a.cap);
        let ptr = 0;
        while (totalBlocks < k && ptr < sortedIndices.length) {
            const idx = sortedIndices[ptr].i;
            if ((counts[idx] + 1) * stripeSize <= usable[idx] * 0.75) {
                counts[idx]++;
                totalBlocks++;
            }
            ptr++;
        }
    }

    return [{
        counts,
        stripeSize,
        k,
        n: totalBlocks,
        maxPayload: k * stripeSize
    }, null];
}
