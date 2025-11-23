/**
 * Naive Huffman decoding implementation (O(N) where N is code length)
 * Uses a Map-based lookup table
 */

/**
 * Build a lookup table for naive Huffman decoding
 * @param {HuffmanTable} table - The Huffman table instance
 */
export function buildNaiveLookup(table) {
    table.lookup = new Map();
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

            // Store: code -> {symbol, length}
            table.lookup.set((code << (16 - bitLength)), {
                symbol,
                length: bitLength
            });

            code++;
            symbolIndex++;
        }

        code <<= 1; // Shift for next bit length
    }
}

/**
 * Decode a symbol using the naive method
 * @param {HuffmanTable} table - The Huffman table instance
 * @param {BitReader} bitReader - Bit reader positioned at start of code
 * @returns {number} Decoded symbol
 */
export function decodeNaive(table, bitReader) {
    if (!table.lookup) {
        buildNaiveLookup(table);
    }

    let code = 0;

    for (let i = 1; i <= table.maxCodeLength; i++) {
        code = (code << 1) | bitReader.readBit();

        // Check if this code exists in lookup
        // The key in the map is shifted to align to 16 bits
        const key = code << (16 - i);
        if (table.lookup.has(key)) {
            const entry = table.lookup.get(key);
            if (entry.length === i) {
                return entry.symbol;
            }
        }
    }

    throw new Error('Invalid Huffman code');
}
