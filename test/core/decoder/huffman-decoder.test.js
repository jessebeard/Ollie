import { describe, it, expect } from '../../utils/test-runner.js';
import {
    decodeDC,
    decodeAC,
    decodeValue,
    decodeBlock
} from '../../../src/core/decoder/huffman-decoder.js';
import { HuffmanTable } from '../../../src/core/decoder/huffman-parser.js';
import { BitReader } from '../../../src/utils/bit-reader.js';

describe('HuffmanDecoder', () => {
    it('should decode DC coefficient category (SSSS)', () => {
        // Create simple DC table: code 0 -> category 0, code 1 -> category 1
        const bits = new Uint8Array(16);
        bits[0] = 2; // 2 codes of length 1
        const values = new Uint8Array([0, 1]);
        const dcTable = new HuffmanTable(bits, values, 0, 0);

        // Test category 0 (no change)
        const data1 = new Uint8Array([0b00000000]); // Bit 0
        const reader1 = new BitReader(data1);
        expect(decodeDC(reader1, dcTable, 100)).toBe(100);
    });

    it('should decode DC coefficient value from additional bits', () => {
        // Simple table: code 0 -> category 3
        const bits = new Uint8Array(16);
        bits[0] = 1;
        const values = new Uint8Array([3]);
        const dcTable = new HuffmanTable(bits, values, 0, 0);

        // Positive value: 0b101 (5) with category 3
        const data = new Uint8Array([0b01010000]); // Code 0, then 101
        const reader = new BitReader(data);
        const result = decodeDC(reader, dcTable, 10);
        expect(result).toBe(15); // 10 + 5
    });

    it('should handle negative DC values (magnitude encoding)', () => {
        // Test decodeValue function directly
        // Category 3: range is -7 to +7
        // Positive: 100 (4), 101 (5), 110 (6), 111 (7)
        expect(decodeValue(0b100, 3)).toBe(4);
        expect(decodeValue(0b111, 3)).toBe(7);

        // Negative: 000 (-7), 001 (-6), 010 (-5), 011 (-4)
        expect(decodeValue(0b000, 3)).toBe(-7);
        expect(decodeValue(0b011, 3)).toBe(-4);
    });

    it('should decode AC coefficient run/size symbols', () => {
        // AC table with various symbols
        const bits = new Uint8Array(16);
        bits[0] = 3; // 3 codes of length 1
        const values = new Uint8Array([
            0x00, // EOB
            0x01, // Run=0, Size=1
            0x11  // Run=1, Size=1
        ]);
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        // Test EOB (all zeros)
        const data1 = new Uint8Array([0b00000000]); // Code 0 = EOB
        const reader1 = new BitReader(data1);
        decodeAC(reader1, acTable, block);

        expect(block[1]).toBe(0);
        expect(block[63]).toBe(0);
    });

    it('should handle ZRL (0xF0) - 16 zeros', () => {
        const bits = new Uint8Array(16);
        bits[0] = 2;
        const values = new Uint8Array([0xF0, 0x00]); // ZRL, EOB
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        // ZRL followed by EOB
        const data = new Uint8Array([0b01000000]); // Code 0 (ZRL), Code 1 (EOB)
        const reader = new BitReader(data);
        decodeAC(reader, acTable, block);

        // First 16 AC coefficients should be zero
        for (let i = 1; i <= 16; i++) {
            expect(block[i]).toBe(0);
        }
    });

    it('should handle EOB (0x00) - end of block', () => {
        const bits = new Uint8Array(16);
        bits[0] = 1;
        const values = new Uint8Array([0x00]); // EOB
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);
        block[1] = 99; // Set a value to verify it gets cleared

        const data = new Uint8Array([0b00000000]);
        const reader = new BitReader(data);
        decodeAC(reader, acTable, block);

        // All AC coefficients should be zero
        for (let i = 1; i < 64; i++) {
            expect(block[i]).toBe(0);
        }
    });

    it('should decode AC coefficient values from additional bits', () => {
        // Symbol 0x01 = Run=0, Size=1
        const bits = new Uint8Array(16);
        bits[0] = 2;
        const values = new Uint8Array([0x01, 0x00]); // Run=0 Size=1, EOB
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        // Code 0 (0x01), then 1 bit value (1), then Code 1 (EOB)
        const data = new Uint8Array([0b01100000]); // 0, 1, 1, ...
        const reader = new BitReader(data);
        decodeAC(reader, acTable, block);

        expect(block[1]).toBe(1); // First AC coefficient
    });

    it('should maintain DC predictor per component', () => {
        const bits = new Uint8Array(16);
        bits[0] = 1;
        const values = new Uint8Array([2]); // Category 2
        const dcTable = new HuffmanTable(bits, values, 0, 0);

        // First block: DC = 0 + 3 = 3
        const data1 = new Uint8Array([0b01110000]); // Code 0, value 11 (3)
        const reader1 = new BitReader(data1);
        const dc1 = decodeDC(reader1, dcTable, 0);
        expect(dc1).toBe(3);

        // Second block: DC = 3 + (-2) = 1
        const data2 = new Uint8Array([0b00100000]); // Code 0, value 01 (-2 in cat 2)
        const reader2 = new BitReader(data2);
        const dc2 = decodeDC(reader2, dcTable, dc1);
        expect(dc2).toBe(1);
    });

    it('should decode a complete 8x8 block', () => {
        // DC table
        const dcBits = new Uint8Array(16);
        dcBits[0] = 1;
        const dcValues = new Uint8Array([2]); // Category 2
        const dcTable = new HuffmanTable(dcBits, dcValues, 0, 0);

        // AC table
        const acBits = new Uint8Array(16);
        acBits[0] = 1;
        const acValues = new Uint8Array([0x00]); // EOB
        const acTable = new HuffmanTable(acBits, acValues, 1, 0);

        // DC: code 0 (1 bit), value 11 (2 bits for category 2) = 3
        // AC: code 0 (1 bit) = EOB
        // Bits: 0 (DC code), 11 (DC value), 0 (AC EOB code)
        const data = new Uint8Array([0b01100000]); // 0, 1, 1, 0, ...
        const reader = new BitReader(data);

        const result = decodeBlock(reader, dcTable, acTable, 0);

        expect(result.dc).toBe(3);
        expect(result.block[0]).toBe(3);
        expect(result.block[1]).toBe(0);
        expect(result.block[63]).toBe(0);
    });

    it('should handle run-length encoding correctly', () => {
        // Symbol 0x21 = Run=2, Size=1 (skip 2 zeros, then 1-bit value)
        const bits = new Uint8Array(16);
        bits[0] = 2;
        const values = new Uint8Array([0x21, 0x00]); // Run=2 Size=1, EOB
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        // Code 0 (0x21), value 1, Code 1 (EOB)
        const data = new Uint8Array([0b01100000]);
        const reader = new BitReader(data);
        decodeAC(reader, acTable, block);

        expect(block[1]).toBe(0); // Skipped
        expect(block[2]).toBe(0); // Skipped
        expect(block[3]).toBe(1); // Value
    });

    it('should handle magnitude encoding for various categories', () => {
        // Category 1: -1, 1
        expect(decodeValue(0b0, 1)).toBe(-1);
        expect(decodeValue(0b1, 1)).toBe(1);

        // Category 2: -3 to -2, 2 to 3
        expect(decodeValue(0b00, 2)).toBe(-3);
        expect(decodeValue(0b01, 2)).toBe(-2);
        expect(decodeValue(0b10, 2)).toBe(2);
        expect(decodeValue(0b11, 2)).toBe(3);

        // Category 4: -15 to -8, 8 to 15
        expect(decodeValue(0b0000, 4)).toBe(-15);
        expect(decodeValue(0b1000, 4)).toBe(8);
        expect(decodeValue(0b1111, 4)).toBe(15);
    });
});
