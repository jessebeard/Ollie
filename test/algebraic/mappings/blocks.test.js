import { describe, it, expect } from '../../utils/test-runner.js';
import { padDimensions, padDimensions420, extractBlock } from '../../../src/algebraic/mappings/blocks.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('Block Processing', () => {
    describe('padDimensions', () => {
        it('should return same dimensions if already multiple of 8', () => {
            const [result, err] = padDimensions(64, 64);
            expect(err).toEqual(null);
            expect(result.width).toBe(64);
            expect(result.height).toBe(64);
        });

        it('should pad width to next multiple of 8', () => {
            const [result, err] = padDimensions(65, 64);
            expect(err).toEqual(null);
            expect(result.width).toBe(72);
            expect(result.height).toBe(64);
        });

        it('should pad height to next multiple of 8', () => {
            const [result, err] = padDimensions(64, 65);
            expect(err).toEqual(null);
            expect(result.width).toBe(64);
            expect(result.height).toBe(72);
        });

        it('should pad both dimensions', () => {
            const [result, err] = padDimensions(10, 10);
            expect(err).toEqual(null);
            expect(result.width).toBe(16);
            expect(result.height).toBe(16);
        });

        it('should handle 1x1 image', () => {
            const [result, err] = padDimensions(1, 1);
            expect(err).toEqual(null);
            expect(result.width).toBe(8);
            expect(result.height).toBe(8);
        });

        it('Property: padded dimensions are always >= input and divisible by 8', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 4096), Arbitrary.integer(1, 4096)],
                (w, h) => {
                    const [result, err] = padDimensions(w, h);
                    if (err) return false;
                    return result.width >= w &&
                        result.height >= h &&
                        result.width % 8 === 0 &&
                        result.height % 8 === 0 &&
                        result.width - w < 8 &&
                        result.height - h < 8;
                },
                50
            );
        });
    });

    describe('padDimensions420', () => {
        it('should return same dimensions if already multiple of 16', () => {
            const [result, err] = padDimensions420(32, 32);
            expect(err).toEqual(null);
            expect(result.width).toBe(32);
            expect(result.height).toBe(32);
        });

        it('should pad to next multiple of 16', () => {
            const [result, err] = padDimensions420(17, 17);
            expect(err).toEqual(null);
            expect(result.width).toBe(32);
            expect(result.height).toBe(32);
        });

        it('should handle 1x1 image', () => {
            const [result, err] = padDimensions420(1, 1);
            expect(err).toEqual(null);
            expect(result.width).toBe(16);
            expect(result.height).toBe(16);
        });

        it('Property: padded dimensions always >= input and divisible by 16', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 4096), Arbitrary.integer(1, 4096)],
                (w, h) => {
                    const [result, err] = padDimensions420(w, h);
                    if (err) return false;
                    return result.width >= w &&
                        result.height >= h &&
                        result.width % 16 === 0 &&
                        result.height % 16 === 0 &&
                        result.width - w < 16 &&
                        result.height - h < 16;
                },
                50
            );
        });
    });

    describe('extractBlock', () => {
        it('should extract a full 8x8 block from center', () => {
            const data = new Float32Array(16 * 16);
            for (let i = 0; i < data.length; i++) data[i] = i;

            const [block, err] = extractBlock(data, 16, 16, 8, 8);
            expect(err).toEqual(null);
            expect(block.length).toBe(64);
            expect(block[0]).toBe(136);
            expect(block[63]).toBe(255);
        });

        it('should pad right edge by clamping', () => {
            const data = new Float32Array(10 * 8);
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 10; x++) {
                    data[y * 10 + x] = x;
                }
            }

            const [block, err] = extractBlock(data, 10, 8, 8, 0);
            expect(err).toEqual(null);
            expect(block[0]).toBe(8);
            expect(block[1]).toBe(9);
            expect(block[2]).toBe(9); // clamped
            expect(block[7]).toBe(9); // clamped
        });

        it('should pad bottom edge by clamping', () => {
            const data = new Float32Array(8 * 10);
            for (let i = 0; i < data.length; i++) data[i] = Math.floor(i / 8);

            const [block, err] = extractBlock(data, 8, 10, 0, 8);
            expect(err).toEqual(null);
            expect(block[0]).toBe(8);
            expect(block[8]).toBe(9);
            expect(block[16]).toBe(9); // clamped
        });

        it('should handle 1x1 image padding', () => {
            const data = new Float32Array(1);
            data[0] = 42;

            const [block, err] = extractBlock(data, 1, 1, 0, 0);
            expect(err).toEqual(null);

            for (let i = 0; i < 64; i++) {
                expect(block[i]).toBe(42);
            }
        });

        it('should always produce 64-element blocks', () => {
            const data = new Float32Array(100 * 100);
            const [block, err] = extractBlock(data, 100, 100, 0, 0);
            expect(err).toEqual(null);
            expect(block.length).toBe(64);
        });
    });
});
