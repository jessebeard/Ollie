import { describe, it, expect } from '/test/utils/test-runner.js';
import { BitWriter } from '/src/utils/bit-writer.js';
import { computeCategory, encodeBlock } from '../../src/core/huffman.js';

describe('Huffman Coding', () => {
    it('computes categories correctly', () => {
        expect(computeCategory(0)).toBe(0);
        expect(computeCategory(1)).toBe(1);
        expect(computeCategory(-1)).toBe(1);
        expect(computeCategory(3)).toBe(2);
        expect(computeCategory(-3)).toBe(2);
        expect(computeCategory(32767)).toBe(15);
    });

    it('writes bits correctly using BitWriter', () => {
        const writer = new BitWriter();
        // Write 1 (1 bit)
        writer.writeBits(1, 1);
        // Write 0 (1 bit)
        writer.writeBits(0, 1);
        // Write 111111 (6 bits) -> Total 8 bits: 10111111 = 0xBF
        writer.writeBits(0x3F, 6);

        const output = writer.flush();
        expect(output.length).toBe(1);
        expect(output[0]).toBe(0xBF);
    });

    it('performs byte stuffing', () => {
        const writer = new BitWriter();
        // Write 0xFF (8 bits)
        writer.writeBits(0xFF, 8);
        const output = writer.flush();
        // Should be 0xFF 0x00
        expect(output.length).toBe(2);
        expect(output[0]).toBe(0xFF);
        expect(output[1]).toBe(0x00);
    });

    it('encodes a simple block', () => {
        const writer = new BitWriter();
        // Block with DC=8, AC[0]=1, rest 0
        const block = new Int32Array(64);
        block[0] = 8;
        block[1] = 1;

        // Previous DC = 0. Diff = 8. Cat = 4.
        // DC Code for cat 4 (Luma): 101 (3 bits)
        // Diff bits for 8 (1000): 1000 (4 bits)
        // Total DC: 101 1000

        // AC[0] = 1. Run = 0. Cat = 1. Symbol = 0x01.
        // AC Code for 0x01 (Luma): 00 (2 bits)
        // Val bits for 1: 1 (1 bit)
        // Total AC: 00 1

        // Rest are zeros -> EOB.
        // EOB Code (0x00): 1010 (4 bits)

        // Total stream: 1011000 001 1010
        // Binary: 10110000 011010xx
        // Hex: B0 68 (padded)

        const newDC = encodeBlock(block, 0, writer);
        expect(newDC).toBe(8);

        const output = writer.flush();
        expect(output.length).toBeGreaterThan(0);
        // Verify first byte is roughly what we expect
        // 10110000 = 0xB0
        expect(output[0]).toBe(0xB0);
    });
});
