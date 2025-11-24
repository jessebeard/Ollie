/**
 * Huffman Decoder - Decodes Huffman-encoded bitstream into quantized coefficients
 * 
 * Implements DC differential decoding and AC run-length decoding
 * as specified in JPEG spec lines 119-134
 */

/**
 * Decode DC coefficient from bitstream
 * DC coefficients are differentially coded against the previous DC value
 * 
 * @param {BitReader} bitReader - Bit reader positioned at DC coefficient
 * @param {HuffmanTable} table - DC Huffman table
 * @param {number} previousDC - Previous DC value for this component
 * @returns {number} Decoded DC coefficient
 */
export function decodeDC(bitReader, table, previousDC) {
    // Decode category (SSSS) using Huffman table
    const category = table.decode(bitReader);

    if (category === 0) {
        // No change from previous DC
        return previousDC;
    }

    // Read additional bits for the actual value
    const bits = bitReader.readBits(category);

    // Decode magnitude (handle negative values)
    const value = decodeValue(bits, category);

    // Add to previous DC (differential coding)
    return previousDC + value;
}

/**
 * Decode AC coefficients from bitstream
 * AC coefficients use run-length encoding of zeros
 * 
 * @param {BitReader} bitReader - Bit reader positioned at AC coefficients
 * @param {HuffmanTable} table - AC Huffman table
 * @param {Int32Array} block - 64-element block to fill (DC already set at index 0)
 */
export function decodeAC(bitReader, table, block, Ss = 1, Se = 63) {
    let k = Ss;

    if (k === 0) k = 1; // AC starts at 1

    while (k <= Se) {
        // Decode run/size symbol
        const symbol = table.decode(bitReader);

        if (symbol === 0x00) {
            // EOB (End of Block) - all remaining coefficients in this band are zero
            // Note: In progressive, this means rest of the band (up to Se) is zero.
            // Since we initialize block to zeros (or it has previous values?), 
            // if it's the first AC scan, zeros are fine.
            // If it's a refinement scan, EOB has different meaning (not implemented yet).
            // For now assuming Spectral Selection only (Ah=0, Al=0).
            break;
        }

        if (symbol === 0xF0) {
            // ZRL (Zero Run Length) - 16 zeros
            for (let i = 0; i < 16 && k <= Se; i++, k++) {
                // block[k] is already 0 if initialized
            }
            continue;
        }

        // Extract run length and size
        const runLength = (symbol >> 4) & 0x0F;
        const size = symbol & 0x0F;

        // Skip zeros
        for (let i = 0; i < runLength && k <= Se; i++, k++) {
            // block[k] is 0
        }

        if (k > Se) break;

        // Read and decode coefficient value
        if (size > 0) {
            const bits = bitReader.readBits(size);
            block[k] = decodeValue(bits, size);
            k++;
        }
    }
}

/**
 * Decode a value from its magnitude representation
 * Negative values are represented in a special way in JPEG
 * 
 * @param {number} bits - Bit pattern read from stream
 * @param {number} size - Number of bits (category)
 * @returns {number} Decoded value
 */
export function decodeValue(bits, size) {
    // If the high bit is 1, value is positive
    const highBit = 1 << (size - 1);

    if (bits >= highBit) {
        return bits;
    } else {
        // Negative value: bits represents (value - 1) in magnitude
        // Formula: value = bits - (2^size - 1)
        return bits - ((1 << size) - 1);
    }
}

/**
 * Decode a complete or partial 8x8 block of quantized coefficients
 * 
 * @param {BitReader} bitReader - Bit reader positioned at block start
 * @param {HuffmanTable} dcTable - DC Huffman table
 * @param {HuffmanTable} acTable - AC Huffman table
 * @param {number} previousDC - Previous DC value for this component
 * @param {Int32Array} [block] - Existing block to update (optional)
 * @param {number} [Ss] - Start of spectral selection (0-63)
 * @param {number} [Se] - End of spectral selection (0-63)
 * @returns {{block: Int32Array, dc: number}} Decoded block and new DC value
 */
export function decodeBlock(bitReader, dcTable, acTable, previousDC, block = null, Ss = 0, Se = 63) {
    if (!block) {
        block = new Int32Array(64);
    }

    let dc = previousDC;

    // Decode DC coefficient if Ss == 0
    if (Ss === 0) {
        dc = decodeDC(bitReader, dcTable, previousDC);
        block[0] = dc;
    }

    // Decode AC coefficients if Se > 0
    // Note: If Ss=0, AC starts at 1. If Ss > 0, AC starts at Ss.
    if (Se > 0) {
        // If Ss is 0, we start AC at 1.
        const acStart = Math.max(1, Ss);
        decodeAC(bitReader, acTable, block, acStart, Se);
    }

    return { block, dc };
}
