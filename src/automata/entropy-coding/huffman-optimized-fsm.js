/**
 * Optimized Huffman decoding implementation (O(1))
 * Uses a 16-bit lookup table (Uint16Array)
 */

/**
 * Build a lookup table for optimized Huffman decoding
 * @param {HuffmanTable} table - The Huffman table instance
 */
export function buildOptimizedLookup(table) {

    table.fastLookup = new Uint16Array(65536);
    table.maxCodeLength = 0;

    let code = 0;
    let symbolIndex = 0;

    for (let bitLength = 1; bitLength <= 16; bitLength++) {
        const count = table.bits[bitLength - 1];

        if (count > 0) {
            table.maxCodeLength = bitLength;
        }

        for (let i = 0; i < count; i++) {
            const symbol = table.values[symbolIndex];

            const baseIndex = code << (16 - bitLength);

            const numEntries = 1 << (16 - bitLength);

            const entry = (bitLength << 8) | symbol;

            for (let j = 0; j < numEntries; j++) {
                table.fastLookup[baseIndex + j] = entry;
            }

            code++;
            symbolIndex++;
        }

        code <<= 1;
    }
}

/**
 * Decode a symbol using the optimized method
 * @param {HuffmanTable} table - The Huffman table instance
 * @param {BitReader} bitReader - Bit reader positioned at start of code
 * @returns {[number, null] | [null, Error]} Tuple: decoded symbol, or error
 */
export function decodeOptimized(table, bitReader) {
    if (!table.fastLookup) {
        buildOptimizedLookup(table);
    }

    const bits = bitReader.peek16Bits();

    const entry = table.fastLookup[bits];
    const length = entry >> 8;

    if (length === 0) {
        return [null, new Error('Invalid Huffman code')];
    }

    bitReader.skipBits(length);

    return [entry & 0xFF, null];
}
