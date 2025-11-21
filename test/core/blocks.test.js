import { describe, it, expect } from '/test/utils/test-runner.js';
import { padDimensions, extractBlock } from '../../src/core/blocks.js';

describe('Block Splitting', () => {
    it('calculates padded dimensions correctly', () => {
        expect(padDimensions(1, 1)).toEqual({ width: 8, height: 8 });
        expect(padDimensions(8, 8)).toEqual({ width: 8, height: 8 });
        expect(padDimensions(9, 9)).toEqual({ width: 16, height: 16 });
        expect(padDimensions(15, 10)).toEqual({ width: 16, height: 16 });
    });

    it('extracts an 8x8 block from a larger array', () => {
        // Create a 16x16 image with sequential data
        const width = 16;
        const height = 16;
        const data = new Float32Array(width * height);
        for (let i = 0; i < data.length; i++) data[i] = i;

        // Extract block at 0,0
        const block0 = extractBlock(data, width, height, 0, 0);
        expect(block0.length).toBe(64);
        expect(block0[0]).toBe(0);
        expect(block0[7]).toBe(7);
        expect(block0[8]).toBe(16); // Next row in original image

        // Extract block at 8,0 (top right)
        const block1 = extractBlock(data, width, height, 8, 0);
        expect(block1[0]).toBe(8);
        expect(block1[7]).toBe(15);
        expect(block1[8]).toBe(24);
    });

    it('pads with last pixel when out of bounds', () => {
        // 2x2 image
        const width = 2;
        const height = 2;
        const data = [1, 2, 3, 4];

        const block = extractBlock(data, width, height, 0, 0);
        // Row 0: 1, 2, 2, 2, 2, 2, 2, 2
        expect(block[0]).toBe(1);
        expect(block[1]).toBe(2);
        expect(block[2]).toBe(2);

        // Row 2 (out of bounds vertically): should repeat row 1 (3, 4, 4...)
        // Actually standard JPEG repeats the last valid line.
        // Row 1 is 3, 4, 4...
        // Row 2 should be same as Row 1
        expect(block[16]).toBe(3);
        expect(block[17]).toBe(4);
        expect(block[18]).toBe(4);
    });
});
