import { describe, it, expect } from '../../utils/test-runner.js';
import {
    parseQuantizationTable,
    parseAllQuantizationTables,
    parseQuantizationTablesFromSegments
} from '../../../src/core/decoder/quantization-parser.js';

describe('QuantizationTableParser', () => {
    it('should parse 8-bit precision table (Pq=0)', () => {
        // Pq=0, Tq=0, followed by 64 bytes
        const data = new Uint8Array(65);
        data[0] = 0x00; // Pq=0 (8-bit), Tq=0
        for (let i = 0; i < 64; i++) {
            data[i + 1] = i + 1; // Values 1-64
        }

        const result = parseQuantizationTable(data, 0);

        expect(result.id).toBe(0);
        expect(result.precision).toBe(0);
        expect(result.table.length).toBe(64);
        expect(result.table[0]).toBe(1);
        expect(result.table[63]).toBe(64);
        expect(result.nextOffset).toBe(65);
    });

    it('should parse 16-bit precision table (Pq=1)', () => {
        // Pq=1, Tq=1, followed by 64 × 2 bytes
        const data = new Uint8Array(1 + 64 * 2);
        data[0] = 0x11; // Pq=1 (16-bit), Tq=1

        // Write some 16-bit values (big-endian)
        data[1] = 0x01; data[2] = 0x00; // 256
        data[3] = 0x02; data[4] = 0x00; // 512

        const result = parseQuantizationTable(data, 0);

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
            const result = parseQuantizationTable(data, 0);
            expect(result.id).toBe(expectedId);
        }
    });

    it('should parse 64 elements', () => {
        const data = new Uint8Array(65);
        data[0] = 0x00; // Pq=0, Tq=0
        for (let i = 0; i < 64; i++) {
            data[i + 1] = (i * 2) % 256;
        }

        const result = parseQuantizationTable(data, 0);
        expect(result.table.length).toBe(64);

        for (let i = 0; i < 64; i++) {
            expect(result.table[i]).toBe((i * 2) % 256);
        }
    });

    it('should handle multiple tables in one DQT segment', () => {
        // Two 8-bit tables
        const data = new Uint8Array(65 * 2);

        // First table: Tq=0
        data[0] = 0x00;
        for (let i = 0; i < 64; i++) {
            data[i + 1] = i;
        }

        // Second table: Tq=1
        data[65] = 0x01;
        for (let i = 0; i < 64; i++) {
            data[65 + i + 1] = 64 + i;
        }

        const tables = parseAllQuantizationTables(data);

        expect(tables.size).toBe(2);
        expect(tables.has(0)).toBe(true);
        expect(tables.has(1)).toBe(true);
        expect(tables.get(0)[0]).toBe(0);
        expect(tables.get(1)[0]).toBe(64);
    });

    it('should validate table ID range', () => {
        const data = new Uint8Array(65);
        data[0] = 0x04; // Invalid table ID (4)

        let errorThrown = false;
        try {
            parseQuantizationTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid quantization table ID: 4');
        }
        expect(errorThrown).toBe(true);
    });

    it('should validate precision value', () => {
        const data = new Uint8Array(65);
        data[0] = 0x20; // Invalid precision (2)

        let errorThrown = false;
        try {
            parseQuantizationTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid quantization table precision: 2');
        }
        expect(errorThrown).toBe(true);
    });

    it('should throw error on incomplete table data', () => {
        const data = new Uint8Array(10); // Only 10 bytes instead of 65
        data[0] = 0x00;

        let errorThrown = false;
        try {
            parseQuantizationTable(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Incomplete quantization table data');
        }
        expect(errorThrown).toBe(true);
    });

    it('should parse tables from multiple DQT segments', () => {
        // Segment 1: Table 0
        const segment1Data = new Uint8Array(65);
        segment1Data[0] = 0x00;
        for (let i = 0; i < 64; i++) {
            segment1Data[i + 1] = i;
        }

        // Segment 2: Table 1
        const segment2Data = new Uint8Array(65);
        segment2Data[0] = 0x01;
        for (let i = 0; i < 64; i++) {
            segment2Data[i + 1] = 64 + i;
        }

        const segments = [
            { data: segment1Data },
            { data: segment2Data }
        ];

        const tables = parseQuantizationTablesFromSegments(segments);

        expect(tables.size).toBe(2);
        expect(tables.get(0)[0]).toBe(0);
        expect(tables.get(1)[0]).toBe(64);
    });

    it('should handle table override in multiple segments', () => {
        // Both segments define table 0
        const segment1Data = new Uint8Array(65);
        segment1Data[0] = 0x00;
        segment1Data[1] = 100; // First value = 100

        const segment2Data = new Uint8Array(65);
        segment2Data[0] = 0x00;
        segment2Data[1] = 200; // First value = 200 (should override)

        const segments = [
            { data: segment1Data },
            { data: segment2Data }
        ];

        const tables = parseQuantizationTablesFromSegments(segments);

        expect(tables.size).toBe(1);
        expect(tables.get(0)[0]).toBe(200); // Should use second segment's value
    });

    it('should parse offset parameter correctly', () => {
        const data = new Uint8Array(130);

        // First table at offset 0
        data[0] = 0x00;

        // Second table at offset 65
        data[65] = 0x01;
        for (let i = 0; i < 64; i++) {
            data[66 + i] = i + 10;
        }

        const result = parseQuantizationTable(data, 65);
        expect(result.id).toBe(1);
        expect(result.table[0]).toBe(10);
    });
});
