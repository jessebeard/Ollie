/**
 * Huffman Table Parser - Parses DHT (Define Huffman Table) segments
 * 
 * DHT segment format (JPEG spec lines 79-86):
 * - Lh (16 bits): Segment length
 * - Loop while bytes remaining:
 *   - Tc_Th (8 bits): Table class (high 4 bits: 0=DC, 1=AC) | Table ID (low 4 bits)
 *   - BITS[1..16] (16 bytes): Number of codes of each length
 *   - HUFFVAL (variable): Symbol values
 */

/**
 * Huffman Table class for decoding
 */
export class HuffmanTable {
    constructor(bits, values, tableClass, tableId) {
        this.bits = bits;           // Array of 16 elements: count of codes for each bit length
        this.values = values;       // Symbol values
        this.tableClass = tableClass; // 0=DC, 1=AC
        this.tableId = tableId;     // 0-3

        // Build lookup table for fast decoding
        this.buildLookupTable();
    }

    /**
     * Build a lookup table for fast Huffman decoding
     * Uses the algorithm from JPEG spec Annex C
     */
    buildLookupTable() {
        this.lookup = new Map();
        this.maxCodeLength = 0;

        let code = 0;
        let symbolIndex = 0;

        for (let bitLength = 1; bitLength <= 16; bitLength++) {
            const count = this.bits[bitLength - 1];

            if (count > 0) {
                this.maxCodeLength = bitLength;
            }

            for (let i = 0; i < count; i++) {
                const symbol = this.values[symbolIndex];

                // Store: code -> {symbol, length}
                this.lookup.set((code << (16 - bitLength)), {
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
     * Decode a symbol from a BitReader
     * @param {BitReader} bitReader - Bit reader positioned at start of code
     * @returns {number} Decoded symbol
     */
    decode(bitReader) {
        let code = 0;

        for (let i = 1; i <= this.maxCodeLength; i++) {
            code = (code << 1) | bitReader.readBit();

            // Check if this code exists in lookup
            const key = code << (16 - i);
            if (this.lookup.has(key)) {
                const entry = this.lookup.get(key);
                if (entry.length === i) {
                    return entry.symbol;
                }
            }
        }

        throw new Error('Invalid Huffman code');
    }
}

/**
 * Parse a single Huffman table from DHT segment data
 * @param {Uint8Array} data - DHT segment data (without marker and length)
 * @param {number} offset - Offset within the segment data
 * @returns {{table: HuffmanTable, nextOffset: number}}
 */
export function parseHuffmanTable(data, offset = 0) {
    if (offset >= data.length) {
        throw new Error('Invalid DHT offset');
    }

    // Read Tc_Th byte
    const tcTh = data[offset];
    const tableClass = (tcTh >> 4) & 0x0F; // High 4 bits: 0=DC, 1=AC
    const tableId = tcTh & 0x0F; // Low 4 bits: 0-3

    // Validate table class
    if (tableClass !== 0 && tableClass !== 1) {
        throw new Error(`Invalid Huffman table class: ${tableClass}`);
    }

    // Validate table ID
    if (tableId > 3) {
        throw new Error(`Invalid Huffman table ID: ${tableId}`);
    }

    // Read BITS array (16 bytes)
    if (offset + 1 + 16 > data.length) {
        throw new Error('Incomplete Huffman BITS array');
    }

    const bits = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        bits[i] = data[offset + 1 + i];
    }

    // Calculate total number of symbols
    let totalSymbols = 0;
    for (let i = 0; i < 16; i++) {
        totalSymbols += bits[i];
    }

    // Validate BITS sum
    if (totalSymbols > 256) {
        throw new Error(`Invalid BITS sum: ${totalSymbols} (max 256)`);
    }

    // Read HUFFVAL array
    if (offset + 1 + 16 + totalSymbols > data.length) {
        throw new Error('Incomplete Huffman HUFFVAL array');
    }

    const values = new Uint8Array(totalSymbols);
    for (let i = 0; i < totalSymbols; i++) {
        values[i] = data[offset + 1 + 16 + i];
    }

    const table = new HuffmanTable(bits, values, tableClass, tableId);

    return {
        table,
        nextOffset: offset + 1 + 16 + totalSymbols
    };
}

/**
 * Parse all Huffman tables from a DHT segment
 * @param {Uint8Array} segmentData - DHT segment data (without marker and length)
 * @returns {Map<string, HuffmanTable>} Map of "class_id" to Huffman table
 */
export function parseAllHuffmanTables(segmentData) {
    const tables = new Map();
    let offset = 0;

    while (offset < segmentData.length) {
        const result = parseHuffmanTable(segmentData, offset);
        const key = `${result.table.tableClass}_${result.table.tableId}`;
        tables.set(key, result.table);
        offset = result.nextOffset;
    }

    return tables;
}

/**
 * Parse Huffman tables from multiple DHT segments
 * @param {Array<{data: Uint8Array}>} dhtSegments - Array of DHT segment objects
 * @returns {Map<string, HuffmanTable>} Map of "class_id" to Huffman table
 */
export function parseHuffmanTablesFromSegments(dhtSegments) {
    const allTables = new Map();

    for (const segment of dhtSegments) {
        const tables = parseAllHuffmanTables(segment.data);
        // Merge tables (later segments can override earlier ones)
        for (const [key, table] of tables) {
            allTables.set(key, table);
        }
    }

    return allTables;
}
