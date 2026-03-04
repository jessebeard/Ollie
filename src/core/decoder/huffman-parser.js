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
import { decodeOptimized, buildOptimizedLookup } from './huffman-decode-optimized.js';

/**
 * Huffman Table class for decoding
 */
export class HuffmanTable {
    constructor(bits, values, tableClass, tableId) {
        this.bits = bits;
        this.values = values;
        this.tableClass = tableClass;
        this.tableId = tableId;

        buildOptimizedLookup(this);
    }

    /**
     * Decode a symbol from a BitReader
     * This method delegates to the optimized implementation
     * @param {BitReader} bitReader - Bit reader positioned at start of code
     * @returns {[number, null] | [null, Error]} Tuple: decoded symbol, or error
     */
    decode(bitReader) {
        return decodeOptimized(this, bitReader);
    }
}

/**
 * Parse a single Huffman table from DHT segment data
 * @param {Uint8Array} data - DHT segment data (without marker and length)
 * @param {number} offset - Offset within the segment data
 * @returns {[{table: HuffmanTable, nextOffset: number}, null] | [null, Error]}
 */
export function parseHuffmanTable(data, offset = 0) {
    if (offset >= data.length) {
        return [null, new Error('Invalid DHT offset')];
    }

    const tcTh = data[offset];
    const tableClass = (tcTh >> 4) & 0x0F;
    const tableId = tcTh & 0x0F;

    if (tableClass !== 0 && tableClass !== 1) {
        return [null, new Error(`Invalid Huffman table class: ${tableClass}`)];
    }

    if (tableId > 3) {
        return [null, new Error(`Invalid Huffman table ID: ${tableId}`)];
    }

    if (offset + 1 + 16 > data.length) {
        return [null, new Error('Incomplete Huffman BITS array')];
    }

    const bits = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        bits[i] = data[offset + 1 + i];
    }

    let totalSymbols = 0;
    for (let i = 0; i < 16; i++) {
        totalSymbols += bits[i];
    }

    if (totalSymbols > 256) {
        return [null, new Error(`Invalid BITS sum: ${totalSymbols} (max 256)`)];
    }

    if (offset + 1 + 16 + totalSymbols > data.length) {
        return [null, new Error('Incomplete Huffman HUFFVAL array')];
    }

    const values = new Uint8Array(totalSymbols);
    for (let i = 0; i < totalSymbols; i++) {
        values[i] = data[offset + 1 + 16 + i];
    }

    const table = new HuffmanTable(bits, values, tableClass, tableId);

    return [{
        table,
        nextOffset: offset + 1 + 16 + totalSymbols
    }, null];
}

/**
 * Parse all Huffman tables from a DHT segment
 * @param {Uint8Array} segmentData - DHT segment data (without marker and length)
 * @returns {[Map<string, HuffmanTable>, null] | [null, Error]}
 */
export function parseAllHuffmanTables(segmentData) {
    const tables = new Map();
    let offset = 0;

    while (offset < segmentData.length) {
        const [result, err] = parseHuffmanTable(segmentData, offset);
        if (err) return [null, err];
        const key = `${result.table.tableClass}_${result.table.tableId}`;
        tables.set(key, result.table);
        offset = result.nextOffset;
    }

    return [tables, null];
}

/**
 * Parse Huffman tables from multiple DHT segments
 * @param {Array<{data: Uint8Array}>} dhtSegments - Array of DHT segment objects
 * @returns {[Map<string, HuffmanTable>, null] | [null, Error]}
 */
export function parseHuffmanTablesFromSegments(dhtSegments) {
    const allTables = new Map();

    for (const segment of dhtSegments) {
        const [tables, err] = parseAllHuffmanTables(segment.data);
        if (err) return [null, err];

        for (const [key, table] of tables) {
            allTables.set(key, table);
        }
    }

    return [allTables, null];
}
