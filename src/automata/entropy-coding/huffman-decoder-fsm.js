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
 * @returns {[number, null] | [null, Error]} Tuple: decoded DC coefficient, or error
 */
export function decodeDC(bitReader, table, previousDC) {

    const [category, catErr] = table.decode(bitReader);
    if (catErr) return [null, catErr];

    if (category === 0) {

        return [previousDC, null];
    }

    const bits = bitReader.readBits(category);

    const value = decodeValue(bits, category);

    return [previousDC + value, null];
}

/**
 * Decode AC coefficients from bitstream
 * AC coefficients use run-length encoding of zeros
 * 
 * @param {BitReader} bitReader - Bit reader positioned at AC coefficients
 * @param {HuffmanTable} table - AC Huffman table
 * @param {Int32Array} block - 64-element block to fill (DC already set at index 0)
 * @returns {[true, null] | [null, Error]} Tuple: success indicator, or error
 */
export function decodeAC(bitReader, table, block, Ss = 1, Se = 63) {
    let k = Ss;

    if (k === 0) k = 1;

    while (k <= Se) {

        const [symbol, symErr] = table.decode(bitReader);
        if (symErr) return [null, symErr];

        if (symbol === 0x00) {

            break;
        }

        if (symbol === 0xF0) {

            for (let i = 0; i < 16 && k <= Se; i++, k++) {

            }
            continue;
        }

        const runLength = (symbol >> 4) & 0x0F;
        const size = symbol & 0x0F;

        for (let i = 0; i < runLength && k <= Se; i++, k++) {

        }

        if (k > Se) break;

        if (size > 0) {
            const bits = bitReader.readBits(size);
            block[k] = decodeValue(bits, size);
            k++;
        }
    }

    return [true, null];
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

    const highBit = 1 << (size - 1);

    if (bits >= highBit) {
        return bits;
    } else {

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
 * @returns {[{block: Int32Array, dc: number}, null] | [null, Error]} Tuple: decoded block and DC, or error
 */
export function decodeBlock(bitReader, dcTable, acTable, previousDC, block = null, Ss = 0, Se = 63) {
    if (!block) {
        block = new Int32Array(64);
    }

    let dc = previousDC;

    if (Ss === 0) {
        const [dcVal, dcErr] = decodeDC(bitReader, dcTable, previousDC);
        if (dcErr) return [null, dcErr];
        dc = dcVal;
        block[0] = dc;
    }

    if (Se > 0) {

        const acStart = Math.max(1, Ss);
        const [, acErr] = decodeAC(bitReader, acTable, block, acStart, Se);
        if (acErr) return [null, acErr];
    }

    return [{ block, dc }, null];
}
