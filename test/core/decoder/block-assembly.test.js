import { describe, it, expect } from '../../utils/test-runner.js';
import { assembleBlocks, componentsToImageData, grayscaleToImageData, cropImageData } from '../../../src/core/decoder/block-assembly.js';

describe('Block Assembly', () => {
    it('should assemble single 8x8 block', () => {
        const block = new Float32Array(64);
        for (let i = 0; i < 64; i++) {
            block[i] = i;
        }

        const result = assembleBlocks([block], 8, 8, 1);

        expect(result.length).toBe(64);
        for (let i = 0; i < 64; i++) {
            expect(result[i]).toBe(i);
        }
    });

    it('should assemble multiple blocks horizontally', () => {
        const block1 = new Float32Array(64).fill(100);
        const block2 = new Float32Array(64).fill(200);

        const result = assembleBlocks([block1, block2], 16, 8, 2);

        expect(result.length).toBe(128);
        // First 8 pixels of each row should be 100
        expect(result[0]).toBe(100);
        expect(result[7]).toBe(100);
        // Next 8 pixels should be 200
        expect(result[8]).toBe(200);
        expect(result[15]).toBe(200);
    });

    it('should assemble multiple blocks vertically', () => {
        const block1 = new Float32Array(64).fill(100);
        const block2 = new Float32Array(64).fill(200);

        const result = assembleBlocks([block1, block2], 8, 16, 1);

        expect(result.length).toBe(128);
        // First 64 pixels should be 100
        expect(result[0]).toBe(100);
        expect(result[63]).toBe(100);
        // Next 64 pixels should be 200
        expect(result[64]).toBe(200);
        expect(result[127]).toBe(200);
    });

    it('should handle partial blocks at edges', () => {
        const block = new Float32Array(64).fill(128);

        // Image is 5x5, but block is 8x8
        const result = assembleBlocks([block], 5, 5, 1);

        expect(result.length).toBe(25);
        // All pixels should be filled
        for (let i = 0; i < 25; i++) {
            expect(result[i]).toBe(128);
        }
    });

    it('should assemble 2x2 grid of blocks', () => {
        const blocks = [
            new Float32Array(64).fill(1),
            new Float32Array(64).fill(2),
            new Float32Array(64).fill(3),
            new Float32Array(64).fill(4)
        ];

        const result = assembleBlocks(blocks, 16, 16, 2);

        expect(result.length).toBe(256);
        // Top-left block
        expect(result[0]).toBe(1);
        // Top-right block
        expect(result[8]).toBe(2);
        // Bottom-left block
        expect(result[128]).toBe(3);
        // Bottom-right block
        expect(result[136]).toBe(4);
    });

    it('should convert YCbCr components to RGBA ImageData', () => {
        const yData = new Float32Array(4).fill(128);
        const cbData = new Float32Array(4).fill(128);
        const crData = new Float32Array(4).fill(128);

        const result = componentsToImageData(yData, cbData, crData, 2, 2);

        expect(result.length).toBe(16); // 2x2 pixels * 4 channels
        // Should produce gray (R=G=B=128)
        expect(result[0]).toBe(128); // R
        expect(result[1]).toBe(128); // G
        expect(result[2]).toBe(128); // B
        expect(result[3]).toBe(255); // A
    });

    it('should set alpha channel to 255', () => {
        const yData = new Float32Array(1).fill(0);
        const cbData = new Float32Array(1).fill(128);
        const crData = new Float32Array(1).fill(128);

        const result = componentsToImageData(yData, cbData, crData, 1, 1);

        expect(result[3]).toBe(255); // Alpha
    });

    it('should convert grayscale to RGBA ImageData', () => {
        const yData = new Float32Array([0, 128, 255, 64]);

        const result = grayscaleToImageData(yData, 2, 2);

        expect(result.length).toBe(16);
        // First pixel (black)
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        expect(result[2]).toBe(0);
        expect(result[3]).toBe(255);
        // Second pixel (gray)
        expect(result[4]).toBe(128);
        expect(result[5]).toBe(128);
        expect(result[6]).toBe(128);
    });

    it('should clamp RGB values in componentsToImageData', () => {
        // Extreme values that might produce out-of-range RGB
        const yData = new Float32Array([300]);
        const cbData = new Float32Array([0]);
        const crData = new Float32Array([255]);

        const result = componentsToImageData(yData, cbData, crData, 1, 1);

        expect(result[0] >= 0 && result[0] <= 255).toBe(true);
        expect(result[1] >= 0 && result[1] <= 255).toBe(true);
        expect(result[2] >= 0 && result[2] <= 255).toBe(true);
    });

    it('should crop image data correctly', () => {
        const imageData = new Uint8ClampedArray(64); // 4x4 pixels * 4 channels
        for (let i = 0; i < 64; i++) {
            imageData[i] = i;
        }

        const cropped = cropImageData(imageData, 4, 4, 2, 2);

        expect(cropped.length).toBe(16); // 2x2 pixels * 4 channels
        // Should contain top-left 2x2 pixels
        expect(cropped[0]).toBe(0);
        expect(cropped[4]).toBe(4);
    });

    it('should not crop if dimensions match', () => {
        const imageData = new Uint8ClampedArray(16);

        const result = cropImageData(imageData, 2, 2, 2, 2);

        // Should return same array
        expect(result).toBe(imageData);
    });

    it('should handle non-multiple-of-8 dimensions', () => {
        const blocks = [
            new Float32Array(64).fill(128),
            new Float32Array(64).fill(128),
            new Float32Array(64).fill(128),
            new Float32Array(64).fill(128)
        ];

        // 10x10 image requires padding to 16x16 (2x2 blocks)
        const result = assembleBlocks(blocks, 10, 10, 2);

        expect(result.length).toBe(100);
        // All pixels should be filled
        for (let i = 0; i < 100; i++) {
            expect(result[i]).toBe(128);
        }
    });
});
