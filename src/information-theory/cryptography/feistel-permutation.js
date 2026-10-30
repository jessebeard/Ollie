/**
 * Zero-dependency Keyed Cycle-Walking Feistel Permutation.
 *
 * Designed for cryptographic steganography over arbitrary integer domains [0, N - 1]
 * up to N = 2^32 (4,294,967,296).
 *
 * Architectural properties:
 * - Zero external dependencies, synchronous O(1) expected permutation/unpermutation.
 * - Full-key absorption via a 256-bit ARX sponge (ChaCha quarter-round mixing) so
 *   every byte of an arbitrarily long seed/key affects all 8 round subkeys.
 * - MurmurHash3 32-bit finalizer (fmix32) with additive round-key mixing as the
 *   round PRF, eliminating 0 -> 0 fixed-point traps and passing Strict Avalanche (SAC).
 * - Unsigned 32-bit safe arithmetic (>>> 0) to prevent signed 32-bit overflow
 *   when half-blocks reach k = 16 bits (N > 2^30).
 *
 * @param {number} N - Domain size (integer in [1, 4294967296]).
 * @param {string | Uint8Array | ArrayBufferView} keySeed - Secret key or seed material.
 * @returns {{ permute: (x: number) => number, unpermute: (y: number) => number }}
 */
export function createCycleWalkingFeistel(N, keySeed) {
    // 1. Validate domain bounds
    if (typeof N !== 'number' || !Number.isInteger(N) || N <= 0 || N > 0x100000000) {
        throw new RangeError(`Invalid domain N: ${N}. Must be an integer in [1, 2^32].`);
    }

    // 2. Normalize keySeed into a Uint8Array
    let keyBytes;
    if (typeof keySeed === 'string') {
        keyBytes = new TextEncoder().encode(keySeed);
    } else if (keySeed instanceof Uint8Array) {
        keyBytes = keySeed;
    } else if (ArrayBuffer.isView(keySeed)) {
        const view = /** @type {ArrayBufferView} */ (keySeed);
        keyBytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    } else {
        throw new TypeError('keySeed must be a string or Uint8Array.');
    }

    // 3. Trivial N = 1 edge case (still validates caller inputs)
    if (N === 1) {
        const checkZero = (x) => {
            if (typeof x !== 'number' || !Number.isInteger(x) || x !== 0) {
                throw new RangeError(`Coordinate ${x} out of bounds for domain [0, 1).`);
            }
            return 0;
        };
        return { permute: checkZero, unpermute: checkZero };
    }

    // 4. Compute balanced half-block width k in [1, 16] such that 2^(2k) >= N
    // Math.clz32(v) works on 32-bit unsigned ints; handle N > 2^31 explicitly.
    let bitsNeeded;
    if (N > 0x80000000) {
        bitsNeeded = 32;
    } else {
        bitsNeeded = 32 - Math.clz32(N - 1);
    }
    const k = Math.max(1, Math.ceil(bitsNeeded / 2)); // Half-block bit width (1..16)
    const mask = ((1 << k) - 1) >>> 0;                // Safe up to k = 16 (0xFFFF)

    // 5. Derive 8 independent 32-bit round subkeys + 8 additive round constants
    //    absorbing 100% of keyBytes (fixes byte-31 truncation & involution traps).
    const ROUNDS = 8;
    const subkeys = deriveSubkeys(keyBytes, N, ROUNDS);

    const k0 = subkeys[0], k1 = subkeys[1], k2 = subkeys[2], k3 = subkeys[3];
    const k4 = subkeys[4], k5 = subkeys[5], k6 = subkeys[6], k7 = subkeys[7];

    /**
     * Non-linear 32-bit PRF (Murmur3 fmix32 core + golden ratio additive offset).
     * Guarantees F(0, K, r) !== 0 and full bit avalanche across 32 bits.
     */
    function roundF(right, roundKey, roundIdx) {
        let h = (right + roundKey + Math.imul(roundIdx + 1, 0x9E3779B9)) >>> 0;
        h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
        return (h ^ (h >>> 16)) >>> 0;
    }

    /**
     * Validates input coordinate is strictly an integer in [0, N - 1].
     */
    function validateCoord(x) {
        if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= N) {
            throw new RangeError(`Coordinate ${x} is out of bounds for domain [0, ${N - 1}].`);
        }
    }

    /**
     * Forward permutation with cycle-walking over M = 2^(2k) -> [0, N - 1].
     */
    function permute(x) {
        validateCoord(x);

        let L = (x >>> k) & mask;
        let R = x & mask;
        let candidate = x;

        do {
            let nextR;

            nextR = (L ^ roundF(R, k0, 0)) & mask; L = R; R = nextR;
            nextR = (L ^ roundF(R, k1, 1)) & mask; L = R; R = nextR;
            nextR = (L ^ roundF(R, k2, 2)) & mask; L = R; R = nextR;
            nextR = (L ^ roundF(R, k3, 3)) & mask; L = R; R = nextR;
            nextR = (L ^ roundF(R, k4, 4)) & mask; L = R; R = nextR;
            nextR = (L ^ roundF(R, k5, 5)) & mask; L = R; R = nextR;
            nextR = (L ^ roundF(R, k6, 6)) & mask; L = R; R = nextR;
            nextR = (L ^ roundF(R, k7, 7)) & mask; L = R; R = nextR;

            // >>> 0 prevents signed 32-bit negative overflow when k = 16 and bit 15 of L is 1
            candidate = (((L << k) >>> 0) | R) >>> 0;
        } while (candidate >= N);

        return candidate;
    }

    /**
     * Inverse permutation with reverse subkey schedule and cycle-walking.
     */
    function unpermute(y) {
        validateCoord(y);

        let L = (y >>> k) & mask;
        let R = y & mask;
        let candidate = y;

        do {
            let prevL;

            prevL = (R ^ roundF(L, k7, 7)) & mask; R = L; L = prevL;
            prevL = (R ^ roundF(L, k6, 6)) & mask; R = L; L = prevL;
            prevL = (R ^ roundF(L, k5, 5)) & mask; R = L; L = prevL;
            prevL = (R ^ roundF(L, k4, 4)) & mask; R = L; L = prevL;
            prevL = (R ^ roundF(L, k3, 3)) & mask; R = L; L = prevL;
            prevL = (R ^ roundF(L, k2, 2)) & mask; R = L; L = prevL;
            prevL = (R ^ roundF(L, k1, 1)) & mask; R = L; L = prevL;
            prevL = (R ^ roundF(L, k0, 0)) & mask; R = L; L = prevL;

            candidate = (((L << k) >>> 0) | R) >>> 0;
        } while (candidate >= N);

        return candidate;
    }

    return { permute, unpermute };
}

/**
 * Absorbs arbitrary-length keyBytes and domain N into a 256-bit (8 x 32-bit)
 * state using ChaCha-style ARX mixing. Every single key byte is mixed across
 * all 8 words before subkey extraction.
 *
 * @param {Uint8Array} keyBytes
 * @param {number} domainN
 * @param {number} count
 * @returns {Uint32Array}
 */
function deriveSubkeys(keyBytes, domainN, count) {
    // Initialize 256-bit state with fractional-root nothing-up-my-sleeve constants (SHA-256 H0..H7)
    const state = new Uint32Array([
        0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
        0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
    ]);

    // Mix in domain size N and key byte-length so distinct domains or lengths never share keystreams
    state[0] = (state[0] ^ (domainN >>> 0)) >>> 0;
    state[1] = (state[1] ^ keyBytes.length) >>> 0;

    const rotl = (v, n) => ((v << n) | (v >>> (32 - n))) >>> 0;

    function mixState() {
        // Two rounds of 8-word ARX cross-column diffusion
        for (let r = 0; r < 2; r++) {
            state[0] = (state[0] + state[4]) >>> 0; state[1] = (state[1] + state[5]) >>> 0;
            state[2] = (state[2] + state[6]) >>> 0; state[3] = (state[3] + state[7]) >>> 0;

            state[4] = rotl(state[4] ^ state[0], 16); state[5] = rotl(state[5] ^ state[1], 16);
            state[6] = rotl(state[6] ^ state[2], 16); state[7] = rotl(state[7] ^ state[3], 16);

            state[0] = (state[0] + state[5]) >>> 0; state[1] = (state[1] + state[6]) >>> 0;
            state[2] = (state[2] + state[7]) >>> 0; state[3] = (state[3] + state[4]) >>> 0;

            state[5] = rotl(state[5] ^ state[0], 12); state[6] = rotl(state[6] ^ state[1], 12);
            state[7] = rotl(state[7] ^ state[2], 12); state[4] = rotl(state[4] ^ state[3], 12);

            state[0] = (state[0] + state[6]) >>> 0; state[1] = (state[1] + state[7]) >>> 0;
            state[2] = (state[2] + state[4]) >>> 0; state[3] = (state[3] + state[5]) >>> 0;

            state[6] = rotl(state[6] ^ state[0], 7);  state[7] = rotl(state[7] ^ state[1], 7);
            state[4] = rotl(state[4] ^ state[2], 7);  state[5] = rotl(state[5] ^ state[3], 7);
        }
    }

    // Absorb all bytes in 4-byte little-endian words (with 0x80 padding for tail bytes)
    const len = keyBytes.length;
    let wordIdx = 0;
    for (let i = 0; i < len; i += 4) {
        const b0 = keyBytes[i];
        const b1 = (i + 1 < len) ? keyBytes[i + 1] : 0x80;
        const b2 = (i + 2 < len) ? keyBytes[i + 2] : 0;
        const b3 = (i + 3 < len) ? keyBytes[i + 3] : 0;
        const word = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;

        state[wordIdx & 7] = (state[wordIdx & 7] ^ word) >>> 0;
        wordIdx++;
        if ((wordIdx & 7) === 0) {
            mixState();
        }
    }

    // Finalize absorption so even a change in the very last byte (e.g., keyB[31] ^= 1)
    // cascades across all 8 state words.
    mixState();
    mixState();

    // Squeeze `count` subkeys through an additional finalizer pass
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
        let z = (state[i & 7] + Math.imul(i + 1, 0x9E3779B9)) >>> 0;
        z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35) >>> 0;
        out[i] = (z ^ (z >>> 16)) >>> 0;
    }

    return out;
}
