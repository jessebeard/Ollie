import { describe, it, expect } from '../../utils/test-runner.js';
import { padDimensions, extractBlock } from '../../../src/core/encoder/blocks.js';

describe('Block Processing', () => {
    describe('padDimensions', () => {
        it('should return same dimensions if already multiple of 8', () => {
            const { width, height } = padDimensions(64, 64);
            expect(width).toBe(64);
            expect(height).toBe(64);
        });

        it('should pad width to next multiple of 8', () => {
            const { width, height } = padDimensions(65, 64);
            expect(width).toBe(72);
            expect(height).toBe(64);
        });

        it('should pad height to next multiple of 8', () => {
            const { width, height } = padDimensions(64, 65);
            expect(width).toBe(64);
            expect(height).toBe(72);
        });

        it('should pad both dimensions', () => {
            const { width, height } = padDimensions(10, 10);
            expect(width).toBe(16);
            expect(height).toBe(16);
        });

        it('should handle 1x1 image', () => {
            const { width, height } = padDimensions(1, 1);
            expect(width).toBe(8);
            expect(height).toBe(8);
        });
    });

    describe('extractBlock', () => {
        it('should extract a full 8x8 block from center', () => {
            // 16x16 image
            const data = new Float32Array(16 * 16);
            for (let i = 0; i < data.length; i++) data[i] = i;

            // Extract block at (8, 8)
            const block = extractBlock(data, 16, 16, 8, 8);

            expect(block.length).toBe(64);
            // Top-left of block should be pixel at (8,8) -> index 8*16 + 8 = 136
            expect(block[0]).toBe(136);
            // Bottom-right of block should be pixel at (15,15) -> index 15*16 + 15 = 255
            expect(block[63]).toBe(255);
        });

        it('should pad right edge by clamping (repeating last column)', () => {
            // 10x8 image (width 10, height 8)
            const data = new Float32Array(10 * 8);
            // Fill with row indices to make checking easy
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 10; x++) {
                    data[y * 10 + x] = x;
                }
            }

            // Extract block at (8, 0). Valid pixels are at x=8, x=9.
            // x=10..15 should repeat x=9.
            const block = extractBlock(data, 10, 8, 8, 0);

            // Row 0
            expect(block[0]).toBe(8); // x=8
            expect(block[1]).toBe(9); // x=9
            expect(block[2]).toBe(9); // x=10 (clamped to 9)
            expect(block[7]).toBe(9); // x=15 (clamped to 9)
        });

        it('should pad bottom edge by clamping (repeating last row)', () => {
            // 8x10 image
            const data = new Float32Array(8 * 10);
            // Fill with y indices
            for (let i = 0; i < data.length; i++) data[i] = Math.floor(i / 8);

            // Extract block at (0, 8). Valid pixels at y=8, y=9.
            // y=10..15 should repeat y=9.
            const block = extractBlock(data, 8, 10, 0, 8);

            // Column 0
            expect(block[0]).toBe(8); // y=8
            expect(block[8]).toBe(9); // y=9
            expect(block[16]).toBe(9); // y=10 (clamped)
            expect(block[56]).toBe(9); // y=15 (clamped)
        });

        it('should pad corner by clamping both dimensions', () => {
            // 9x9 image.
            const data = new Float32Array(9 * 9);
            data.fill(0);
            // Set (8,8) to 100
            data[8 * 9 + 8] = 100;

            // Extract block at (8, 8). Only (0,0) in local block is valid.
            const block = extractBlock(data, 9, 9, 8, 8);

            // All pixels in the block should be 100 because (8,8) is the only source
            // and it gets clamped for all x>8 and y>8.
            for (let i = 0; i < 64; i++) {
                expect(block[i]).toBe(100);
            }
        });

        it('should handle 1x1 image padding', () => {
            const data = new Float32Array(1);
            data[0] = 42;

            const block = extractBlock(data, 1, 1, 0, 0);

            for (let i = 0; i < 64; i++) {
                expect(block[i]).toBe(42);
            }
        });
    });
});
