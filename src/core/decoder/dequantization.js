/**
 * Dequantization - Multiply quantized coefficients by quantization table values
 * 
 * This reverses the quantization step from encoding.
 * JPEG spec lines 135-141 describe the dequantization process.
 */

/**
 * Dequantize an 8x8 block of coefficients
 * 
 * @param {Int32Array|Float32Array} quantizedBlock - 64-element block of quantized coefficients
 * @param {Int32Array} quantTable - 64-element quantization table
 * @returns {Float32Array} Dequantized coefficients
 */
export function dequantize(quantizedBlock, quantTable, outputBuffer = null) {
    if (quantizedBlock.length !== 64) {
        throw new Error(`Invalid block length: ${quantizedBlock.length} (expected 64)`);
    }

    if (quantTable.length !== 64) {
        throw new Error(`Invalid quantization table length: ${quantTable.length} (expected 64)`);
    }

    const dequantized = outputBuffer || new Float32Array(64);

    for (let i = 0; i < 64; i++) {
        dequantized[i] = quantizedBlock[i] * quantTable[i];
    }

    return dequantized;
}

/**
 * Bypass dequantization (for debugging)
 * Returns the quantized coefficients as-is (but as floats)
 */
export function dequantizeBypass(quantizedBlock, quantTable, outputBuffer = null) {
    const dequantized = outputBuffer || new Float32Array(64);
    for (let i = 0; i < 64; i++) {
        dequantized[i] = quantizedBlock[i];
    }
    return dequantized;
}
