/**
 * Pure JavaScript Linear-Time Syndrome-Trellis Codes (STC) Implementation.
 *
 * Implements Syndrome-Trellis Codes (Filler, Judas, Fridrich - IEEE TIFS 2011):
 * - Dual-trellis Viterbi algorithm for near-bound embedding efficiency with non-uniform costs.
 * - Submatrix generator from deterministic seed.
 * - Constant-bounded submatrix width (maxW=16) for O(M) bounded memory and sub-millisecond execution.
 * - Wet cost handling for untouchable coefficients (DC components, out-of-bounds).
 * - Linear-time message extractor from cover/stego AC parity sequences.
 */
export const WET_COST = 1e12;
export const DEFAULT_SUBMATRIX_HEIGHT = 8; // h=8 constraint height (2^8 = 256 states)
export const DEFAULT_MAX_W = 16; // Maximum submatrix width to prevent unbounded trellis allocations

/**
 * Generates an h x w binary submatrix H_hat deterministically from a 32-byte seed.
 * Each column is represented as an integer whose bits correspond to the rows.
 *
 * @param {number} h - Constraint height (rows), typically 8
 * @param {number} w - Block width (columns)
 * @param {Uint8Array|string} [seed] - Seed for randomizing the submatrix
 * @returns {Uint32Array} Array of w column values
 */
export function generateSubmatrix(h, w, seed) {
    const cols = new Uint32Array(w);
    const maxVal = (1 << h) - 1;

    let prngSeed = 0x811C9DC5 >>> 0;
    if (seed) {
        const seedBytes = typeof seed === 'string'
            ? new TextEncoder().encode(seed)
            : (seed instanceof Uint8Array ? seed : new Uint8Array(0));
        for (let i = 0; i < seedBytes.length; i++) {
            prngSeed = Math.imul(prngSeed ^ seedBytes[i], 0x01000193) >>> 0;
        }
    }

    const nextRandom = () => {
        prngSeed = Math.imul(prngSeed ^ (prngSeed >>> 15), 0x45D9F3B) >>> 0;
        prngSeed = Math.imul(prngSeed ^ (prngSeed >>> 15), 0x45D9F3B) >>> 0;
        prngSeed = (prngSeed ^ (prngSeed >>> 16)) >>> 0;
        return prngSeed;
    };

    for (let c = 0; c < w; c++) {
        let col = 0;
        do {
            col = (nextRandom() % maxVal) + 1;
            if (c === 0 || c === w - 1) {
                col |= 1;
            }
        } while (col === 0 || (c > 0 && cols.subarray(0, c).includes(col)));
        cols[c] = col;
    }

    return cols;
}

/**
 * Syndrome-Trellis Encoder.
 *
 * @param {Int32Array|Array<number>} cover
 * @param {Uint8Array|Array<number>} messageBits
 * @param {Float64Array|Array<number>} rhoPlus
 * @param {Float64Array|Array<number>} rhoMinus
 * @param {Object} [options]
 * @returns {[Int32Array|null, Error|null]}
 */
export function stcEmbed(cover, messageBits, rhoPlus, rhoMinus, options = {}) {
    const N = cover.length;
    const M = messageBits.length;

    if (M === 0) return [new Int32Array(cover), null];

    const maxW = options.maxW !== undefined ? options.maxW : DEFAULT_MAX_W;
    const rawW = Math.floor(N / M);
    if (rawW < 1) {
        return [null, new Error(`stc: payload too large for cover size (M=${M}, N=${N})`)];
    }
    const w = Math.max(1, Math.min(rawW, maxW));
    const totalUsedCoeffs = M * w;

    const h = options.h || DEFAULT_SUBMATRIX_HEIGHT;
    const numStates = 1 << h;
    const submatrix = generateSubmatrix(h, w, options.seed);

    // Dynamic programming metrics
    let currMetrics = new Float64Array(numStates).fill(Infinity);
    currMetrics[0] = 0;

    // We record fromState and decision for each transition:
    // fromState[i][nextState] and decision[i][nextState] (0: no change, 1: +1, 2: -1)
    const prevStates = new Uint16Array(totalUsedCoeffs * numStates);
    const decisions = new Uint8Array(totalUsedCoeffs * numStates);

    // Pre-shift state transition array for block boundaries
    const blockShiftFrom = new Uint16Array(M * numStates);

    let nextMetrics = new Float64Array(numStates);

    for (let k = 0; k < M; k++) {
        for (let j = 0; j < w; j++) {
            const i = k * w + j;
            const col = submatrix[j];
            const origParity = Math.abs(cover[i]) & 1;
            const costPlus = rhoPlus[i] !== undefined ? rhoPlus[i] : 1.0;
            const costMinus = rhoMinus[i] !== undefined ? rhoMinus[i] : 1.0;

            nextMetrics.fill(Infinity);
            const offset = i * numStates;

            for (let s = 0; s < numStates; s++) {
                const curM = currMetrics[s];
                if (curM === Infinity) continue;

                // Option 0: No change (keep origParity)
                const s0 = s ^ (origParity * col);
                if (curM < nextMetrics[s0]) {
                    nextMetrics[s0] = curM;
                    prevStates[offset + s0] = s;
                    decisions[offset + s0] = 0;
                }

                // Flip parity: (1 - origParity)
                const sFlipped = s ^ ((1 - origParity) * col);

                // Option 1: +1
                if (costPlus < WET_COST && curM + costPlus < nextMetrics[sFlipped]) {
                    nextMetrics[sFlipped] = curM + costPlus;
                    prevStates[offset + sFlipped] = s;
                    decisions[offset + sFlipped] = 1;
                }

                // Option 2: -1
                if (costMinus < WET_COST && curM + costMinus < nextMetrics[sFlipped]) {
                    nextMetrics[sFlipped] = curM + costMinus;
                    prevStates[offset + sFlipped] = s;
                    decisions[offset + sFlipped] = 2;
                }
            }

            // Swap buffers
            const temp = currMetrics;
            currMetrics = nextMetrics;
            nextMetrics = temp;
        }

        // Syndrome pruning & row shift at block boundary k
        const mBit = messageBits[k] & 1;
        nextMetrics.fill(Infinity);
        const shiftOffset = k * numStates;

        for (let s = 0; s < numStates; s++) {
            // Only states with LSB == mBit survive
            if ((s & 1) === mBit && currMetrics[s] !== Infinity) {
                const sNext = s >>> 1;
                if (currMetrics[s] < nextMetrics[sNext]) {
                    nextMetrics[sNext] = currMetrics[s];
                    blockShiftFrom[shiftOffset + sNext] = s;
                }
            }
        }

        currMetrics.set(nextMetrics);
    }

    // Find best end state
    let bestState = 0;
    let minCost = currMetrics[0];
    for (let s = 1; s < numStates; s++) {
        if (currMetrics[s] < minCost) {
            minCost = currMetrics[s];
            bestState = s;
        }
    }

    if (minCost === Infinity) {
        return [null, new Error('stc: failed to find valid syndrome path (capacity or wet constraints exceeded)')];
    }

    // Traceback reconstruction
    const stego = new Int32Array(cover);
    let state = bestState;

    for (let k = M - 1; k >= 0; k--) {
        // Unshift block transition
        state = blockShiftFrom[k * numStates + state];

        for (let j = w - 1; j >= 0; j--) {
            const i = k * w + j;
            const offset = i * numStates;
            const dec = decisions[offset + state];
            const prevState = prevStates[offset + state];

            if (dec === 1) {
                stego[i] = cover[i] + 1;
            } else if (dec === 2) {
                stego[i] = cover[i] - 1;
            } else {
                stego[i] = cover[i];
            }

            state = prevState;
        }
    }

    return [stego, null];
}

/**
 * Syndrome-Trellis Extractor.
 *
 * @param {Int32Array|Array<number>} stego
 * @param {number} messageBitLength
 * @param {Object} [options]
 * @returns {Uint8Array}
 */
export function stcExtract(stego, messageBitLength, options = {}) {
    const N = stego.length;
    const M = messageBitLength;

    if (M === 0) return new Uint8Array(0);

    const maxW = options.maxW !== undefined ? options.maxW : DEFAULT_MAX_W;
    const rawW = Math.floor(N / M);
    if (rawW < 1) return new Uint8Array(0);
    const w = Math.max(1, Math.min(rawW, maxW));

    const h = options.h || DEFAULT_SUBMATRIX_HEIGHT;
    const submatrix = generateSubmatrix(h, w, options.seed);
    const extracted = new Uint8Array(M);

    let state = 0;

    for (let k = 0; k < M; k++) {
        for (let j = 0; j < w; j++) {
            const i = k * w + j;
            const parity = Math.abs(stego[i]) & 1;
            state = (state ^ (parity * submatrix[j])) >>> 0;
        }

        extracted[k] = state & 1;
        state = (state >>> 1) >>> 0;
    }

    return extracted;
}

export function bytesToBits(bytes) {
    const bits = new Uint8Array(bytes.length * 8);
    for (let i = 0; i < bytes.length; i++) {
        for (let b = 0; b < 8; b++) {
            bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
        }
    }
    return bits;
}

export function bitsToBytes(bits) {
    const byteCount = Math.floor(bits.length / 8);
    const bytes = new Uint8Array(byteCount);
    for (let i = 0; i < byteCount; i++) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
            byteVal = (byteVal << 1) | (bits[i * 8 + b] & 1);
        }
        bytes[i] = byteVal;
    }
    return bytes;
}
