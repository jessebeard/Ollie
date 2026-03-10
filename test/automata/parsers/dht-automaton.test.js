import { describe, it, expect } from '../../utils/test-runner.js';
import {
    HuffmanTable,
    parseHuffmanTable,
    parseAllHuffmanTables,
    parseHuffmanTablesFromSegments
} from '../../../src/automata/parsers/dht-automaton.js';
import { BitReader } from '../../../src/automata/bit-streams/bit-reader.js';

describe('HuffmanTableParser', () => {
    it('should parse DC table (Tc=0)', () => {
        
        const data = new Uint8Array(1 + 16 + 2);
        data[0] = 0x00; 

        data[1] = 2; 

        data[17] = 0;
        data[18] = 1;

        const [result, resultErr] = parseHuffmanTable(data, 0);

        expect(result.table.tableClass).toBe(0);
        expect(result.table.tableId).toBe(0);
        expect(result.table.bits[0]).toBe(2);
        expect(result.table.values[0]).toBe(0);
        expect(result.table.values[1]).toBe(1);
    });

    it('should parse AC table (Tc=1)', () => {
        const data = new Uint8Array(1 + 16 + 3);
        data[0] = 0x10; 

        data[2] = 3;

        data[17] = 0x01;
        data[18] = 0x02;
        data[19] = 0x03;

        const [result, resultErr] = parseHuffmanTable(data, 0);

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
            const [result, resultErr] = parseHuffmanTable(data, 0);
            expect(result.table.tableId).toBe(expectedId);
        }
    });

    it('should parse BITS array (16 bytes)', () => {
        const data = new Uint8Array(1 + 16 + 5);
        data[0] = 0x00;

        data[1] = 0;  
        data[2] = 2;  
        data[3] = 1;  
        data[4] = 2;  

        for (let i = 0; i < 5; i++) {
            data[17 + i] = i + 10;
        }

        const [result, resultErr] = parseHuffmanTable(data, 0);

        expect(result.table.bits[0]).toBe(0);
        expect(result.table.bits[1]).toBe(2);
        expect(result.table.bits[2]).toBe(1);
        expect(result.table.bits[3]).toBe(2);
    });

    it('should parse HUFFVAL array (variable length)', () => {
        const data = new Uint8Array(1 + 16 + 4);
        data[0] = 0x00;
        data[1] = 4; 

        data[17] = 0xAA;
        data[18] = 0xBB;
        data[19] = 0xCC;
        data[20] = 0xDD;

        const [result, resultErr] = parseHuffmanTable(data, 0);

        expect(result.table.values.length).toBe(4);
        expect(result.table.values[0]).toBe(0xAA);
        expect(result.table.values[3]).toBe(0xDD);
    });

    it('should validate BITS sum <= 256', () => {
        const data = new Uint8Array(1 + 16 + 0);
        data[0] = 0x00;

        for (let i = 0; i < 16; i++) {
            data[1 + i] = 20; 
        }

        const [, parseHuffmanTableErrResult] = parseHuffmanTable(data, 0);
        expect(parseHuffmanTableErrResult).toBeDefined();
        expect(parseHuffmanTableErrResult.message).toBe('Invalid BITS sum: 320 (max 256)');
    });

    it('should build lookup table for fast decoding', () => {
        
        const bits = new Uint8Array(16);
        bits[0] = 2; 
        const values = new Uint8Array([5, 6]);

        const table = new HuffmanTable(bits, values, 0, 0);

        expect(table.fastLookup).toBeDefined();
        expect(table.fastLookup.length).toBe(65536);
        expect(table.maxCodeLength).toBe(1);
    });

    it('should handle multiple tables in one DHT segment', () => {
        
        const table1Size = 1 + 16 + 2;
        const table2Size = 1 + 16 + 3;
        const data = new Uint8Array(table1Size + table2Size);

        data[0] = 0x00;
        data[1] = 2; 
        data[17] = 0;
        data[18] = 1;

        data[table1Size] = 0x10;
        data[table1Size + 1] = 3; 
        data[table1Size + 17] = 10;
        data[table1Size + 18] = 11;
        data[table1Size + 19] = 12;

        const [tables, tablesErr] = parseAllHuffmanTables(data);

        expect(tables.size).toBe(2);
        expect(tables.has('0_0')).toBe(true); 
        expect(tables.has('1_0')).toBe(true); 
    });

    it('should validate table class', () => {
        const data = new Uint8Array(1 + 16);
        data[0] = 0x20; 

        const [, parseHuffmanTableErrResult] = parseHuffmanTable(data, 0);
        expect(parseHuffmanTableErrResult).toBeDefined();
        expect(parseHuffmanTableErrResult.message).toBe('Invalid Huffman table class: 2');
    });

    it('should validate table ID range', () => {
        const data = new Uint8Array(1 + 16);
        data[0] = 0x04; 

        const [, parseHuffmanTableErrResult] = parseHuffmanTable(data, 0);
        expect(parseHuffmanTableErrResult).toBeDefined();
        expect(parseHuffmanTableErrResult.message).toBe('Invalid Huffman table ID: 4');
    });

    it('should throw error on incomplete BITS array', () => {
        const data = new Uint8Array(10); 
        data[0] = 0x00;

        const [, parseHuffmanTableErrResult] = parseHuffmanTable(data, 0);
        expect(parseHuffmanTableErrResult).toBeDefined();
        expect(parseHuffmanTableErrResult.message).toBe('Incomplete Huffman BITS array');
    });

    it('should throw error on incomplete HUFFVAL array', () => {
        const data = new Uint8Array(1 + 16 + 1); 
        data[0] = 0x00;
        data[1] = 2; 

        const [, parseHuffmanTableErrResult] = parseHuffmanTable(data, 0);
        expect(parseHuffmanTableErrResult).toBeDefined();
        expect(parseHuffmanTableErrResult.message).toBe('Incomplete Huffman HUFFVAL array');
    });

    it('should decode simple Huffman codes', () => {
        
        const bits = new Uint8Array(16);
        bits[0] = 2; 
        const values = new Uint8Array([5, 6]);

        const table = new HuffmanTable(bits, values, 0, 0);

        const data1 = new Uint8Array([0b00000000]); 
        const reader1 = new BitReader(data1);
        { const [sym] = table.decode(reader1); expect(sym).toBe(5); }

        const data2 = new Uint8Array([0b10000000]); 
        const reader2 = new BitReader(data2);
        { const [sym] = table.decode(reader2); expect(sym).toBe(6); }
    });

    it('should parse tables from multiple DHT segments', () => {
        
        const seg1 = new Uint8Array(1 + 16 + 1);
        seg1[0] = 0x00;
        seg1[1] = 1;
        seg1[17] = 100;

        const seg2 = new Uint8Array(1 + 16 + 1);
        seg2[0] = 0x10;
        seg2[1] = 1;
        seg2[17] = 200;

        const segments = [
            { data: seg1 },
            { data: seg2 }
        ];

        const [tables, tablesErr] = parseHuffmanTablesFromSegments(segments);

        expect(tables.size).toBe(2);
        expect(tables.get('0_0').values[0]).toBe(100);
        expect(tables.get('1_0').values[0]).toBe(200);
    });
});
