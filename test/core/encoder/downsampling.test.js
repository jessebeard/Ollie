import { describe, it, expect } from '../../utils/test-runner.js';
import { downsampleBlock420, extractLumaBlocks420 } from '../../../src/core/encoder/downsampling.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('Chroma Downsampling', () => {
    describe('downsampleBlock420', () => {
        it('should produce 64-element output from 16x16 region', () => {
            const source = new Float32Array(16 * 16).fill(100);
            const [block, err] = downsampleBlock420(source, 16, 0, 0, 16, 16);
            expect(err).toEqual(null);
            expect(block.length).toBe(64);
        });

        it('should average 2x2 regions correctly', () => {
            // Create a 16x16 image where each pixel = its x + y position
            const source = new Float32Array(16 * 16);
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    source[y * 16 + x] = x + y;
                }
            }

            const [block, err] = downsampleBlock420(source, 16, 0, 0, 16, 16);
            expect(err).toEqual(null);

            // First output pixel should average (0,0),(1,0),(0,1),(1,1) = (0+1+1+2)/4 = 1
            expect(block[0]).toBe(1);
            // Second output pixel should average (2,0),(3,0),(2,1),(3,1) = (2+3+3+4)/4 = 3
            expect(block[1]).toBe(3);
        });

        it('should handle uniform input (all same value)', () => {
            const val = 128;
            const source = new Float32Array(16 * 16).fill(val);
            const [block, err] = downsampleBlock420(source, 16, 0, 0, 16, 16);
            expect(err).toEqual(null);

            for (let i = 0; i < 64; i++) {
                expect(block[i]).toBe(val);
            }
        });

        it('Property: uniform input → uniform output', async () => {
            await assertProperty(
                [Arbitrary.integer(-128, 127)],
                (val) => {
                    const source = new Float32Array(16 * 16).fill(val);
                    const [block, err] = downsampleBlock420(source, 16, 0, 0, 16, 16);
                    if (err) return false;
                    for (let i = 0; i < 64; i++) {
                        if (block[i] !== val) return false;
                    }
                    return true;
                },
                50
            );
        });

        it('should clamp at image boundaries', () => {
            // Small 4x4 image, request a block starting at (0,0) with img boundary at 4x4
            const source = new Float32Array(4 * 4).fill(50);
            const [block, err] = downsampleBlock420(source, 4, 0, 0, 4, 4);
            expect(err).toEqual(null);
            expect(block.length).toBe(64);
            // All values should be 50 (clamped samples from edges)
            for (let i = 0; i < 64; i++) {
                expect(block[i]).toBe(50);
            }
        });
    });

    describe('extractLumaBlocks420', () => {
        it('should return exactly 4 blocks', () => {
            const yChannel = new Float32Array(16 * 16).fill(100);
            const [blocks, err] = extractLumaBlocks420(yChannel, 16, 0, 0, 16, 16);
            expect(err).toEqual(null);
            expect(blocks.length).toBe(4);
        });

        it('each block should be 64 elements', () => {
            const yChannel = new Float32Array(16 * 16).fill(0);
            const [blocks, err] = extractLumaBlocks420(yChannel, 16, 0, 0, 16, 16);
            expect(err).toEqual(null);
            for (const block of blocks) {
                expect(block.length).toBe(64);
            }
        });

        it('should extract correct quadrants', () => {
            // Fill image so each pixel = unique value
            const yChannel = new Float32Array(16 * 16);
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    yChannel[y * 16 + x] = y * 16 + x;
                }
            }

            const [blocks, err] = extractLumaBlocks420(yChannel, 16, 0, 0, 16, 16);
            expect(err).toEqual(null);

            // Block 0 (top-left): starts at (0,0)
            expect(blocks[0][0]).toBe(0);
            // Block 1 (top-right): starts at (8,0)
            expect(blocks[1][0]).toBe(8);
            // Block 2 (bottom-left): starts at (0,8)
            expect(blocks[2][0]).toBe(128); // y=8, x=0 → 8*16+0=128
            // Block 3 (bottom-right): starts at (8,8)
            expect(blocks[3][0]).toBe(136); // y=8, x=8 → 8*16+8=136
        });

        it('should handle edge clamping', () => {
            // Image smaller than 16x16
            const yChannel = new Float32Array(10 * 10).fill(77);
            const [blocks, err] = extractLumaBlocks420(yChannel, 10, 0, 0, 10, 10);
            expect(err).toEqual(null);
            expect(blocks.length).toBe(4);
            // All pixels should be 77 (clamped at boundaries)
            for (const block of blocks) {
                for (let i = 0; i < 64; i++) {
                    expect(block[i]).toBe(77);
                }
            }
        });

        it('Property: uniform input produces 4 identical uniform blocks', async () => {
            await assertProperty(
                [Arbitrary.integer(0, 255)],
                (val) => {
                    const yChannel = new Float32Array(16 * 16).fill(val);
                    const [blocks, err] = extractLumaBlocks420(yChannel, 16, 0, 0, 16, 16);
                    if (err) return false;
                    if (blocks.length !== 4) return false;
                    for (const block of blocks) {
                        for (let i = 0; i < 64; i++) {
                            if (block[i] !== val) return false;
                        }
                    }
                    return true;
                },
                50
            );
        });
    });
});
