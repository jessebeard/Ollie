import { describe, it, expect } from '../../utils/test-runner.js';
import { BitWriter } from '../../../src/utils/bit-writer.js';
import { computeCategory, encodeBlock } from '../../../src/core/encoder/huffman.js';

describe('Huffman Coding', () => {
    it('computes categories correctly', () => {
        expect(computeCategory(0)).toBe(0);
        expect(computeCategory(1)).toBe(1);
        expect(computeCategory(-1)).toBe(1);
        expect(computeCategory(2)).toBe(2);
        expect(computeCategory(-3)).toBe(2);
        expect(computeCategory(32767)).toBe(15);
        expect(computeCategory(-32768)).toBe(16);
    });

    it('writes bits correctly using BitWriter', () => {
        const writer = new BitWriter();
        writer.writeBits(0b101, 3);
        writer.writeBits(0b11, 2);

        const bytes = writer.flush();
        expect(bytes.length).toBe(1);
        expect(bytes[0]).toBe(0xBF);
    });

    it('expands buffer dynamically', () => {
        const writer = new BitWriter(1); 
        for (let i = 0; i < 100; i++) {
            writer.writeBits(0xAA, 8);
        }
        const bytes = writer.flush();
        expect(bytes.length).toBe(100);
    });

    it('performs byte stuffing (0xFF -> 0xFF 0x00)', () => {
        const writer = new BitWriter();
        writer.writeBits(0xFF, 8);
        const bytes = writer.flush();

        expect(bytes.length).toBe(2);
        expect(bytes[0]).toBe(0xFF);
        expect(bytes[1]).toBe(0x00);
    });

    it('performs byte stuffing across writes', () => {
        const writer = new BitWriter();
        writer.writeBits(0xF, 4);
        writer.writeBits(0xF, 4); 
        const bytes = writer.flush();

        expect(bytes.length).toBe(2);
        expect(bytes[0]).toBe(0xFF);
        expect(bytes[1]).toBe(0x00);
    });

    it('encodes a simple block', () => {
        const writer = new BitWriter();
        
        const block = new Int32Array(64);
        block[0] = 8;
        block[1] = 1;

    });
});
