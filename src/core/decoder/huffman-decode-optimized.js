/**
 * Optimized Huffman decoding implementation (O(1))
 * Uses a 16-bit lookup table (Uint16Array)
 */

/**
 * Build a lookup table for optimized Huffman decoding
 * @param {HuffmanTable} table - The Huffman table instance
 */
export function buildOptimizedLookup(table) {
    // We use a Uint16Array of size 65536 (2^16)
    // Each entry stores: (length << 8) | symbol
    // If length is 0, the code is invalid
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

            // The code is 'bitLength' bits long.
            // We need to fill all 16-bit entries that start with this code.
            // The code is in the upper 'bitLength' bits of the 16-bit index.
            // So we shift code left by (16 - bitLength).
            const baseIndex = code << (16 - bitLength);

            // The number of entries to fill is 2^(16 - bitLength)
            // e.g. if code is 2 bits, we fill 2^14 entries
            const numEntries = 1 << (16 - bitLength);

            // Entry value: length in high byte, symbol in low byte
            const entry = (bitLength << 8) | symbol;

            for (let j = 0; j < numEntries; j++) {
                table.fastLookup[baseIndex + j] = entry;
            }

            code++;
            symbolIndex++;
        }

        code <<= 1; // Shift for next bit length
    }
}

/**
 * Decode a symbol using the optimized method
 * @param {HuffmanTable} table - The Huffman table instance
 * @param {BitReader} bitReader - Bit reader positioned at start of code
 * @returns {number} Decoded symbol
 */
export function decodeOptimized(table, bitReader) {
    if (!table.fastLookup) {
        buildOptimizedLookup(table);
    }

    // Peek next 16 bits
    const bits = bitReader.peek16Bits();

    // Look up in fast table
    const entry = table.fastLookup[bits];
    const length = entry >> 8;

    if (length === 0) {
        throw new Error('Invalid Huffman code');
    }

    // Consume the bits
    bitReader.skipBits(length);

    // Return symbol (low 8 bits)
    return entry & 0xFF;
}
