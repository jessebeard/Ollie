/**
 * Inverse ZigZag - Converts 1D coefficient array to 8x8 2D block
 * 
 * The inverse of the zigzag reordering used during encoding.
 * JPEG spec lines 149-158 define the zigzag order.
 */

// Zigzag order (maps 2D position to zigzag index)
// This is the same pattern used in the encoder
export const ZIGZAG_ORDER = new Int32Array([
    0, 1, 8, 16, 9, 2, 3, 10,
    17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63
]);

/**
 * Convert 1D zigzag-ordered array to 8x8 2D block
 * 
 * @param {Int32Array|Float32Array} zigzagArray - 64-element array in zigzag order
 * @returns {Float32Array} 64-element array in natural 2D order (row-major)
 */
export function inverseZigZag(zigzagArray) {
    if (zigzagArray.length !== 64) {
        throw new Error(`Invalid zigzag array length: ${zigzagArray.length} (expected 64)`);
    }

    const block = new Float32Array(64);

    // Inverse operation: zigzagArray[i] goes to position ZIGZAG_ORDER[i]
    for (let i = 0; i < 64; i++) {
        block[ZIGZAG_ORDER[i]] = zigzagArray[i];
    }

    return block;
}
