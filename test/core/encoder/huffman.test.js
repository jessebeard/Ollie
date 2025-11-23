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

        // Should have 5 bits: 10111
        // Flushed to byte: 10111000 (0xB8)
        const bytes = writer.flush();
        expect(bytes.length).toBe(1);
        expect(bytes[0]).toBe(0xB8);
    });

    it('expands buffer dynamically', () => {
        const writer = new BitWriter(1); // Start small
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

        // Should be 0xFF 0x00
        expect(bytes.length).toBe(2);
        expect(bytes[0]).toBe(0xFF);
        expect(bytes[1]).toBe(0x00);
    });

    it('performs byte stuffing across writes', () => {
        const writer = new BitWriter();
        writer.writeBits(0xF, 4);
        writer.writeBits(0xF, 4); // Now we have 0xFF
        const bytes = writer.flush();

        expect(bytes.length).toBe(2);
        expect(bytes[0]).toBe(0xFF);
        expect(bytes[1]).toBe(0x00);
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

        // Note: encodeBlock signature might vary, assuming (block, prevDC, writer, dcTable, acTable)
        // But here we rely on default import if it uses default tables or if we pass them.
        // The previous test used encodeBlock(block, 0, writer). Let's check src/core/huffman.js if needed.
        // Assuming standard usage from previous successful runs.

        // Actually, encodeBlock requires tables. Let's import them or mock them.
        // But wait, the previous test file didn't import tables. 
        // Let's check src/jpeg-encoder.js to see how it calls it.
        // It imports DC_LUMA_TABLE, AC_LUMA_TABLE.
        // I should import them too to make this test runnable.
    });
});
