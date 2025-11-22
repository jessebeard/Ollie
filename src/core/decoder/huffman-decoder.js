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
export function decodeAC(bitReader, table, block) {
    let k = 1; // Start after DC coefficient

    while (k < 64) {
        // Decode run/size symbol
        const symbol = table.decode(bitReader);

        if (symbol === 0x00) {
            // EOB (End of Block) - all remaining coefficients are zero
            for (let i = k; i < 64; i++) {
                block[i] = 0;
            }
            break;
        }

        if (symbol === 0xF0) {
            // ZRL (Zero Run Length) - 16 zeros
            for (let i = 0; i < 16 && k < 64; i++, k++) {
                block[k] = 0;
            }
            continue;
        }

        // Extract run length and size
        const runLength = (symbol >> 4) & 0x0F;
        const size = symbol & 0x0F;

        // Skip zeros
        for (let i = 0; i < runLength && k < 64; i++, k++) {
            block[k] = 0;
        }

        if (k >= 64) break;

        // Read and decode coefficient value
        if (size > 0) {
            const bits = bitReader.readBits(size);
            block[k] = decodeValue(bits, size);
            k++;
        }
    }

    // Fill any remaining coefficients with zeros
    while (k < 64) {
        block[k++] = 0;
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
 * Decode a complete 8x8 block of quantized coefficients
 * 
 * @param {BitReader} bitReader - Bit reader positioned at block start
 * @param {HuffmanTable} dcTable - DC Huffman table
 * @param {HuffmanTable} acTable - AC Huffman table
 * @param {number} previousDC - Previous DC value for this component
 * @returns {{block: Int32Array, dc: number}} Decoded block and new DC value
 */
export function decodeBlock(bitReader, dcTable, acTable, previousDC) {
    const block = new Int32Array(64);

    // Decode DC coefficient
    const dc = decodeDC(bitReader, dcTable, previousDC);
    block[0] = dc;

    // Decode AC coefficients
    decodeAC(bitReader, acTable, block);

    return { block, dc };
}
