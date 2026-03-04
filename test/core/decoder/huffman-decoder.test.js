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

        const bits = new Uint8Array(16);
        bits[0] = 2;
        const values = new Uint8Array([0, 1]);
        const dcTable = new HuffmanTable(bits, values, 0, 0);

        const data1 = new Uint8Array([0b00000000]);
        const reader1 = new BitReader(data1);
        const [dc1, dc1Err] = decodeDC(reader1, dcTable, 100);
        expect(dc1Err).toEqual(null);
        expect(dc1).toBe(100);
    });

    it('should decode DC coefficient value from additional bits', () => {

        const bits = new Uint8Array(16);
        bits[0] = 1;
        const values = new Uint8Array([3]);
        const dcTable = new HuffmanTable(bits, values, 0, 0);

        const data = new Uint8Array([0b01010000]);
        const reader = new BitReader(data);
        const [result, resultErr] = decodeDC(reader, dcTable, 10);
        expect(resultErr).toEqual(null);
        expect(result).toBe(15);
    });

    it('should handle negative DC values (magnitude encoding)', () => {

        expect(decodeValue(0b100, 3)).toBe(4);
        expect(decodeValue(0b111, 3)).toBe(7);

        expect(decodeValue(0b000, 3)).toBe(-7);
        expect(decodeValue(0b011, 3)).toBe(-4);
    });

    it('should decode AC coefficient run/size symbols', () => {

        const bits = new Uint8Array(16);
        bits[0] = 3;
        const values = new Uint8Array([
            0x00,
            0x01,
            0x11
        ]);
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        const data1 = new Uint8Array([0b00000000]);
        const reader1 = new BitReader(data1);
        const [, acErr] = decodeAC(reader1, acTable, block);
        expect(acErr).toEqual(null);

        expect(block[1]).toBe(0);
        expect(block[63]).toBe(0);
    });

    it('should handle ZRL (0xF0) - 16 zeros', () => {
        const bits = new Uint8Array(16);
        bits[0] = 2;
        const values = new Uint8Array([0xF0, 0x00]);
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        const data = new Uint8Array([0b01000000]);
        const reader = new BitReader(data);
        const [, acErr] = decodeAC(reader, acTable, block);
        expect(acErr).toEqual(null);

        for (let i = 1; i <= 16; i++) {
            expect(block[i]).toBe(0);
        }
    });

    it('should handle EOB (0x00) - end of block', () => {
        const bits = new Uint8Array(16);
        bits[0] = 1;
        const values = new Uint8Array([0x00]);
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        const data = new Uint8Array([0b00000000]);
        const reader = new BitReader(data);
        const [, acErr] = decodeAC(reader, acTable, block);
        expect(acErr).toEqual(null);

        for (let i = 1; i < 64; i++) {
            expect(block[i]).toBe(0);
        }
    });

    it('should decode AC coefficient values from additional bits', () => {

        const bits = new Uint8Array(16);
        bits[0] = 2;
        const values = new Uint8Array([0x01, 0x00]);
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        const data = new Uint8Array([0b01100000]);
        const reader = new BitReader(data);
        const [, acErr] = decodeAC(reader, acTable, block);
        expect(acErr).toEqual(null);

        expect(block[1]).toBe(1);
    });

    it('should maintain DC predictor per component', () => {
        const bits = new Uint8Array(16);
        bits[0] = 1;
        const values = new Uint8Array([2]);
        const dcTable = new HuffmanTable(bits, values, 0, 0);

        const data1 = new Uint8Array([0b01110000]);
        const reader1 = new BitReader(data1);
        const [dc1, dc1Err] = decodeDC(reader1, dcTable, 0);
        expect(dc1Err).toEqual(null);
        expect(dc1).toBe(3);

        const data2 = new Uint8Array([0b00100000]);
        const reader2 = new BitReader(data2);
        const [dc2, dc2Err] = decodeDC(reader2, dcTable, dc1);
        expect(dc2Err).toEqual(null);
        expect(dc2).toBe(1);
    });

    it('should decode a complete 8x8 block', () => {

        const dcBits = new Uint8Array(16);
        dcBits[0] = 1;
        const dcValues = new Uint8Array([2]);
        const dcTable = new HuffmanTable(dcBits, dcValues, 0, 0);

        const acBits = new Uint8Array(16);
        acBits[0] = 1;
        const acValues = new Uint8Array([0x00]);
        const acTable = new HuffmanTable(acBits, acValues, 1, 0);

        const data = new Uint8Array([0b01100000]);
        const reader = new BitReader(data);

        const [result, blkErr] = decodeBlock(reader, dcTable, acTable, 0);
        expect(blkErr).toEqual(null);

        expect(result.dc).toBe(3);
        expect(result.block[0]).toBe(3);
        expect(result.block[1]).toBe(0);
        expect(result.block[63]).toBe(0);
    });

    it('should handle run-length encoding correctly', () => {

        const bits = new Uint8Array(16);
        bits[0] = 2;
        const values = new Uint8Array([0x21, 0x00]);
        const acTable = new HuffmanTable(bits, values, 1, 0);

        const block = new Int32Array(64);

        const data = new Uint8Array([0b01100000]);
        const reader = new BitReader(data);
        const [, acErr] = decodeAC(reader, acTable, block);
        expect(acErr).toEqual(null);

        expect(block[1]).toBe(0);
        expect(block[2]).toBe(0);
        expect(block[3]).toBe(1);
    });

    it('should handle magnitude encoding for various categories', () => {

        expect(decodeValue(0b0, 1)).toBe(-1);
        expect(decodeValue(0b1, 1)).toBe(1);

        expect(decodeValue(0b00, 2)).toBe(-3);
        expect(decodeValue(0b01, 2)).toBe(-2);
        expect(decodeValue(0b10, 2)).toBe(2);
        expect(decodeValue(0b11, 2)).toBe(3);

        expect(decodeValue(0b0000, 4)).toBe(-15);
        expect(decodeValue(0b1000, 4)).toBe(8);
        expect(decodeValue(0b1111, 4)).toBe(15);
    });
});
