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
            
            const data = new Float32Array(16 * 16);
            for (let i = 0; i < data.length; i++) data[i] = i;

            const block = extractBlock(data, 16, 16, 8, 8);

            expect(block.length).toBe(64);
            
            expect(block[0]).toBe(136);
            
            expect(block[63]).toBe(255);
        });

        it('should pad right edge by clamping (repeating last column)', () => {
            
            const data = new Float32Array(10 * 8);
            
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 10; x++) {
                    data[y * 10 + x] = x;
                }
            }

            const block = extractBlock(data, 10, 8, 8, 0);

            expect(block[0]).toBe(8); 
            expect(block[1]).toBe(9); 
            expect(block[2]).toBe(9); 
            expect(block[7]).toBe(9); 
        });

        it('should pad bottom edge by clamping (repeating last row)', () => {
            
            const data = new Float32Array(8 * 10);
            
            for (let i = 0; i < data.length; i++) data[i] = Math.floor(i / 8);

            const block = extractBlock(data, 8, 10, 0, 8);

            expect(block[0]).toBe(8); 
            expect(block[8]).toBe(9); 
            expect(block[16]).toBe(9); 
            expect(block[56]).toBe(9); 
        });

        it('should pad corner by clamping both dimensions', () => {
            
            const data = new Float32Array(9 * 9);
            data.fill(0);
            
            data[8 * 9 + 8] = 100;

            const block = extractBlock(data, 9, 9, 8, 8);

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
