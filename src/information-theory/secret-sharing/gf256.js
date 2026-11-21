/**
 * GF(2^8) field arithmetic shared by Reed-Solomon error correction,
 * Shamir secret sharing, and Cauchy erasure coding.
 *
 * Field: GF(256) with primitive polynomial 0x11D (QR-code field),
 * generator 2. Addition/subtraction are XOR; multiplication/division run
 * through exp/log lookup tables (exp doubled to 512 entries so
 * multiplication can skip a modulus branch).
 */

export const EXP_TABLE = new Uint8Array(512);
export const LOG_TABLE = new Uint8Array(256);

(function buildTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) {
        EXP_TABLE[i] = EXP_TABLE[i - 255];
    }
}());

/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gfMultiply(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

/**
 * Multiplicative inverse. inverse(0) maps to 0 by RS convention.
 *
 * @param {number} a
 * @returns {number}
 */
export function gfInverse(a) {
    if (a === 0) return 0;
    return EXP_TABLE[255 - LOG_TABLE[a]];
}
