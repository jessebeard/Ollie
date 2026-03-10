import { describe, it, expect } from '../../utils/test-runner.js';
import {
    parseQuantizationTable,
    parseAllQuantizationTables,
    parseQuantizationTablesFromSegments
} from '../../../src/automata/parsers/dqt-automaton.js';

describe('QuantizationTableParser', () => {
    it('should parse 8-bit precision table (Pq=0)', () => {
        
        const data = new Uint8Array(65);
        data[0] = 0x00; 
        for (let i = 0; i < 64; i++) {
            data[i + 1] = i + 1; 
        }

        const [result, resultErr] = parseQuantizationTable(data, 0);

        expect(result.id).toBe(0);
        expect(result.precision).toBe(0);
        expect(result.table.length).toBe(64);
        expect(result.table[0]).toBe(1);
        expect(result.table[63]).toBe(64);
        expect(result.nextOffset).toBe(65);
    });

    it('should parse 16-bit precision table (Pq=1)', () => {
        
        const data = new Uint8Array(1 + 64 * 2);
        data[0] = 0x11; 

        data[1] = 0x01; data[2] = 0x00; 
        data[3] = 0x02; data[4] = 0x00; 

        const [result, resultErr] = parseQuantizationTable(data, 0);

        expect(result.id).toBe(1);
        expect(result.precision).toBe(1);
        expect(result.table[0]).toBe(256);
        expect(result.table[1]).toBe(512);
    });

    it('should extract table destination ID (0-3)', () => {
        const testCases = [
            { pqTq: 0x00, expectedId: 0 },
            { pqTq: 0x01, expectedId: 1 },
            { pqTq: 0x02, expectedId: 2 },
            { pqTq: 0x03, expectedId: 3 }
        ];

        for (const { pqTq, expectedId } of testCases) {
            const data = new Uint8Array(65);
            data[0] = pqTq;
            const [result, resultErr] = parseQuantizationTable(data, 0);
            expect(result.id).toBe(expectedId);
        }
    });

    it('should parse 64 elements', () => {
        const data = new Uint8Array(65);
        data[0] = 0x00; 
        for (let i = 0; i < 64; i++) {
            data[i + 1] = (i * 2) % 256;
        }

        const [result, resultErr] = parseQuantizationTable(data, 0);
        expect(result.table.length).toBe(64);

        for (let i = 0; i < 64; i++) {
            expect(result.table[i]).toBe((i * 2) % 256);
        }
    });

    it('should handle multiple tables in one DQT segment', () => {
        
        const data = new Uint8Array(65 * 2);

        data[0] = 0x00;
        for (let i = 0; i < 64; i++) {
            data[i + 1] = i;
        }

        data[65] = 0x01;
        for (let i = 0; i < 64; i++) {
            data[65 + i + 1] = 64 + i;
        }

        const [tables, tablesErr] = parseAllQuantizationTables(data);

        expect(tables.size).toBe(2);
        expect(tables.has(0)).toBe(true);
        expect(tables.has(1)).toBe(true);
        expect(tables.get(0)[0]).toBe(0);
        expect(tables.get(1)[0]).toBe(64);
    });

    it('should validate table ID range', () => {
        const data = new Uint8Array(65);
        data[0] = 0x04; 

        const [, parseQuantizationTableErrResult] = parseQuantizationTable(data, 0);
        expect(parseQuantizationTableErrResult).toBeDefined();
        expect(parseQuantizationTableErrResult.message).toBe('Invalid quantization table ID: 4');
    });

    it('should validate precision value', () => {
        const data = new Uint8Array(65);
        data[0] = 0x20; 

        const [, parseQuantizationTableErrResult] = parseQuantizationTable(data, 0);
        expect(parseQuantizationTableErrResult).toBeDefined();
        expect(parseQuantizationTableErrResult.message).toBe('Invalid quantization table precision: 2');
    });

    it('should throw error on incomplete table data', () => {
        const data = new Uint8Array(10); 
        data[0] = 0x00;

        const [, parseQuantizationTableErrResult] = parseQuantizationTable(data, 0);
        expect(parseQuantizationTableErrResult).toBeDefined();
        expect(parseQuantizationTableErrResult.message).toBe('Incomplete quantization table data');
    });

    it('should parse tables from multiple DQT segments', () => {
        
        const segment1Data = new Uint8Array(65);
        segment1Data[0] = 0x00;
        for (let i = 0; i < 64; i++) {
            segment1Data[i + 1] = i;
        }

        const segment2Data = new Uint8Array(65);
        segment2Data[0] = 0x01;
        for (let i = 0; i < 64; i++) {
            segment2Data[i + 1] = 64 + i;
        }

        const segments = [
            { data: segment1Data },
            { data: segment2Data }
        ];

        const [tables, tablesErr] = parseQuantizationTablesFromSegments(segments);

        expect(tables.size).toBe(2);
        expect(tables.get(0)[0]).toBe(0);
        expect(tables.get(1)[0]).toBe(64);
    });

    it('should handle table override in multiple segments', () => {
        
        const segment1Data = new Uint8Array(65);
        segment1Data[0] = 0x00;
        segment1Data[1] = 100; 

        const segment2Data = new Uint8Array(65);
        segment2Data[0] = 0x00;
        segment2Data[1] = 200; 

        const segments = [
            { data: segment1Data },
            { data: segment2Data }
        ];

        const [tables, tablesErr] = parseQuantizationTablesFromSegments(segments);

        expect(tables.size).toBe(1);
        expect(tables.get(0)[0]).toBe(200); 
    });

    it('should parse offset parameter correctly', () => {
        const data = new Uint8Array(130);

        data[0] = 0x00;

        data[65] = 0x01;
        for (let i = 0; i < 64; i++) {
            data[66 + i] = i + 10;
        }

        const [result, resultErr] = parseQuantizationTable(data, 65);
        expect(result.id).toBe(1);
        expect(result.table[0]).toBe(10);
    });
});
