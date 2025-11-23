import { describe, it, expect } from '../../utils/test-runner.js';
import {
    HuffmanTable,
    parseHuffmanTable,
    parseAllHuffmanTables,
    parseHuffmanTablesFromSegments
} from '../../../src/core/decoder/huffman-parser.js';
import { BitReader } from '../../../src/utils/bit-reader.js';

describe('HuffmanTableParser', () => {
    it('should parse DC table (Tc=0)', () => {
        // Simple DC table: Tc=0, Th=0
        const data = new Uint8Array(1 + 16 + 2);
        data[0] = 0x00; // Tc=0 (DC), Th=0

        // BITS: 2 codes of length 1
        data[1] = 2; // 2 codes of length 1
        // Rest are 0

        // HUFFVAL: symbols 0, 1
        data[17] = 0;
        data[18] = 1;

        const result = parseHuffmanTable(data, 0);

        expect(result.table.tableClass).toBe(0);
        expect(result.table.tableId).toBe(0);
        expect(result.table.bits[0]).toBe(2);
        expect(result.table.values[0]).toBe(0);
        expect(result.table.values[1]).toBe(1);
    });

    it('should parse AC table (Tc=1)', () => {
        const data = new Uint8Array(1 + 16 + 3);
        data[0] = 0x10; // Tc=1 (AC), Th=0

        // BITS: 3 codes of length 2
        data[2] = 3;

        // HUFFVAL
        data[17] = 0x01;
        data[18] = 0x02;
        data[19] = 0x03;

        const result = parseHuffmanTable(data, 0);

        expect(result.table.tableClass).toBe(1);
        expect(result.table.tableId).toBe(0);
    });

    it('should extract table destination ID (0-3)', () => {
        const testCases = [
            { tcTh: 0x00, expectedId: 0 },
            { tcTh: 0x01, expectedId: 1 },
            { tcTh: 0x02, expectedId: 2 },
            { tcTh: 0x03, expectedId: 3 }
        ];

        for (const { tcTh, expectedId } of testCases) {
            const data = new Uint8Array(1 + 16 + 0);
            data[0] = tcTh;
            const result = parseHuffmanTable(data, 0);
            expect(result.table.tableId).toBe(expectedId);
        }
    });

    it('should parse BITS array (16 bytes)', () => {
        const data = new Uint8Array(1 + 16 + 5);
        data[0] = 0x00;

        // BITS: specific pattern
        data[1] = 0;  // Length 1: 0 codes
        data[2] = 2;  // Length 2: 2 codes
        data[3] = 1;  // Length 3: 1 code
        data[4] = 2;  // Length 4: 2 codes
        // Rest are 0

        // HUFFVAL (5 symbols total)
        for (let i = 0; i < 5; i++) {
            data[17 + i] = i + 10;
        }

        const result = parseHuffmanTable(data, 0);

        expect(result.table.bits[0]).toBe(0);
        expect(result.table.bits[1]).toBe(2);
        expect(result.table.bits[2]).toBe(1);
        expect(result.table.bits[3]).toBe(2);
    });

    it('should parse HUFFVAL array (variable length)', () => {
        const data = new Uint8Array(1 + 16 + 4);
        data[0] = 0x00;
        data[1] = 4; // 4 codes of length 1

        data[17] = 0xAA;
        data[18] = 0xBB;
        data[19] = 0xCC;
        data[20] = 0xDD;

        const result = parseHuffmanTable(data, 0);

        expect(result.table.values.length).toBe(4);
        expect(result.table.values[0]).toBe(0xAA);
        expect(result.table.values[3]).toBe(0xDD);
    });

    it('should validate BITS sum <= 256', () => {
        const data = new Uint8Array(1 + 16 + 0);
        data[0] = 0x00;

        // Set BITS to sum > 256
        for (let i = 0; i < 16; i++) {
            data[1 + i] = 20; // Total = 320
        }

        let errorThrown = false;
        try {
            parseHuffmanTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid BITS sum: 320 (max 256)');
        }
        expect(errorThrown).toBe(true);
    });

    it('should build lookup table for fast decoding', () => {
        // Simple table: 2 codes of length 1
        const bits = new Uint8Array(16);
        bits[0] = 2; // 2 codes of length 1
        const values = new Uint8Array([5, 6]);

        const table = new HuffmanTable(bits, values, 0, 0);

        expect(table.fastLookup).toBeDefined();
        expect(table.fastLookup.length).toBe(65536);
        expect(table.maxCodeLength).toBe(1);
    });

    it('should handle multiple tables in one DHT segment', () => {
        // Two tables: DC table 0 and AC table 0
        const table1Size = 1 + 16 + 2;
        const table2Size = 1 + 16 + 3;
        const data = new Uint8Array(table1Size + table2Size);

        // Table 1: DC, ID=0
        data[0] = 0x00;
        data[1] = 2; // 2 codes
        data[17] = 0;
        data[18] = 1;

        // Table 2: AC, ID=0
        data[table1Size] = 0x10;
        data[table1Size + 1] = 3; // 3 codes
        data[table1Size + 17] = 10;
        data[table1Size + 18] = 11;
        data[table1Size + 19] = 12;

        const tables = parseAllHuffmanTables(data);

        expect(tables.size).toBe(2);
        expect(tables.has('0_0')).toBe(true); // DC table 0
        expect(tables.has('1_0')).toBe(true); // AC table 0
    });

    it('should validate table class', () => {
        const data = new Uint8Array(1 + 16);
        data[0] = 0x20; // Invalid class (2)

        let errorThrown = false;
        try {
            parseHuffmanTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid Huffman table class: 2');
        }
        expect(errorThrown).toBe(true);
    });

    it('should validate table ID range', () => {
        const data = new Uint8Array(1 + 16);
        data[0] = 0x04; // Invalid ID (4)

        let errorThrown = false;
        try {
            parseHuffmanTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid Huffman table ID: 4');
        }
        expect(errorThrown).toBe(true);
    });

    it('should throw error on incomplete BITS array', () => {
        const data = new Uint8Array(10); // Too short
        data[0] = 0x00;

        let errorThrown = false;
        try {
            parseHuffmanTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Incomplete Huffman BITS array');
        }
        expect(errorThrown).toBe(true);
    });

    it('should throw error on incomplete HUFFVAL array', () => {
        const data = new Uint8Array(1 + 16 + 1); // Claims 2 symbols but only has 1
        data[0] = 0x00;
        data[1] = 2; // 2 codes

        let errorThrown = false;
        try {
            parseHuffmanTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Incomplete Huffman HUFFVAL array');
        }
        expect(errorThrown).toBe(true);
    });

    it('should decode simple Huffman codes', () => {
        // Create a simple table: codes 0, 1 (1 bit each) -> symbols 5, 6
        const bits = new Uint8Array(16);
        bits[0] = 2; // 2 codes of length 1
        const values = new Uint8Array([5, 6]);

        const table = new HuffmanTable(bits, values, 0, 0);

        // Test decoding: bit 0 -> symbol 5, bit 1 -> symbol 6
        const data1 = new Uint8Array([0b00000000]); // First bit is 0
        const reader1 = new BitReader(data1);
        expect(table.decode(reader1)).toBe(5);

        const data2 = new Uint8Array([0b10000000]); // First bit is 1
        const reader2 = new BitReader(data2);
        expect(table.decode(reader2)).toBe(6);
    });

    it('should parse tables from multiple DHT segments', () => {
        // Segment 1: DC table 0
        const seg1 = new Uint8Array(1 + 16 + 1);
        seg1[0] = 0x00;
        seg1[1] = 1;
        seg1[17] = 100;

        // Segment 2: AC table 0
        const seg2 = new Uint8Array(1 + 16 + 1);
        seg2[0] = 0x10;
        seg2[1] = 1;
        seg2[17] = 200;

        const segments = [
            { data: seg1 },
            { data: seg2 }
        ];

        const tables = parseHuffmanTablesFromSegments(segments);

        expect(tables.size).toBe(2);
        expect(tables.get('0_0').values[0]).toBe(100);
        expect(tables.get('1_0').values[0]).toBe(200);
    });
});
