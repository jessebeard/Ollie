import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../src/core/jpeg-decoder.js';

describe('Encoder-Decoder Roundtrip', () => {
    function createSolidImage(width, height, r, g, b) {
        const imageData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            imageData[i * 4 + 0] = r;
            imageData[i * 4 + 1] = g;
            imageData[i * 4 + 2] = b;
            imageData[i * 4 + 3] = 255;
        }
        return { data: imageData, width, height };
    }

    function createGradientImage(width, height) {
        const imageData = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                const value = Math.floor((x / width) * 255);
                imageData[i * 4 + 0] = value;
                imageData[i * 4 + 1] = value;
                imageData[i * 4 + 2] = value;
                imageData[i * 4 + 3] = 255;
            }
        }
        return { data: imageData, width, height };
    }

    function calculatePSNR(original, decoded, width, height) {
        let mse = 0;
        for (let i = 0; i < width * height; i++) {
            const rDiff = original.data[i * 4 + 0] - decoded.data[i * 4 + 0];
            const gDiff = original.data[i * 4 + 1] - decoded.data[i * 4 + 1];
            const bDiff = original.data[i * 4 + 2] - decoded.data[i * 4 + 2];
            mse += (rDiff * rDiff + gDiff * gDiff + bDiff * bDiff) / 3;
        }
        mse /= (width * height);
        if (mse === 0) return Infinity;
        return 10 * Math.log10((255 * 255) / mse);
    }

    it('should roundtrip solid black image', async () => {
        const original = createSolidImage(8, 8, 0, 0, 0);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(8);
        expect(decoded.height).toBe(8);

        // Should be close to black
        const avgR = decoded.data[0];
        expect(avgR < 20).toBe(true);
    });

    it('should roundtrip solid white image', async () => {
        const original = createSolidImage(8, 8, 255, 255, 255);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(8);
        expect(decoded.height).toBe(8);

        // Should be close to white
        const avgR = decoded.data[0];
        expect(avgR > 235).toBe(true);
    });

    it('should roundtrip solid color image', async () => {
        const original = createSolidImage(8, 8, 128, 64, 192);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(8);
        expect(decoded.height).toBe(8);

        // Colors should be approximately correct (within tolerance)
        const r = decoded.data[0];
        const g = decoded.data[1];
        const b = decoded.data[2];
        expect(Math.abs(r - 128) < 20).toBe(true);
        expect(Math.abs(g - 64) < 20).toBe(true);
        expect(Math.abs(b - 192) < 20).toBe(true);
    });

    it('should roundtrip gradient image', async () => {
        const original = createGradientImage(16, 16);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(16);
        expect(decoded.height).toBe(16);

        // Should have gradient pattern (left darker than right)
        const leftPixel = decoded.data[0];
        const rightPixel = decoded.data[(15 * 4)];
        expect(rightPixel > leftPixel).toBe(true);
    });

    it('should maintain image dimensions', async () => {
        const sizes = [
            [8, 8],
            [16, 16],
            [24, 24],
            [10, 10], // Non-multiple of 8
            [15, 15]
        ];

        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        for (const [width, height] of sizes) {
            const original = createSolidImage(width, height, 128, 128, 128);
            const jpegBytes = await encoder.encode(original, 90);
            const decoded = await decoder.decode(jpegBytes);

            expect(decoded.width).toBe(width);
            expect(decoded.height).toBe(height);
        }
    });

    it('should produce acceptable quality at Q=90', async () => {
        const original = createGradientImage(16, 16);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        const psnr = calculatePSNR(original, decoded, 16, 16);

        // PSNR > 30dB is generally considered acceptable
        expect(psnr > 30).toBe(true);
    });

    it('should handle different quality settings', async () => {
        const original = createSolidImage(8, 8, 128, 128, 128);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const q10 = await encoder.encode(original, 10);
        const q50 = await encoder.encode(original, 50);
        const q90 = await encoder.encode(original, 90);

        const decoded10 = await decoder.decode(q10);
        const decoded50 = await decoder.decode(q50);
        const decoded90 = await decoder.decode(q90);

        expect(decoded10.width).toBe(8);
        expect(decoded50.width).toBe(8);
        expect(decoded90.width).toBe(8);
    });

    it('should preserve alpha channel', async () => {
        const original = createSolidImage(8, 8, 100, 150, 200);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        // All alpha values should be 255
        for (let i = 3; i < decoded.data.length; i += 4) {
            expect(decoded.data[i]).toBe(255);
        }
    });

    it('should handle edge case 1x1 image', async () => {
        const original = createSolidImage(1, 1, 128, 128, 128);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(1);
        expect(decoded.height).toBe(1);
        expect(decoded.data.length).toBe(4);
    });

    it('should handle 8x8 image (single MCU)', async () => {
        const original = createGradientImage(8, 8);
        const encoder = new JpegEncoder();
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original, 90);
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(8);
        expect(decoded.height).toBe(8);

        const psnr = calculatePSNR(original, decoded, 8, 8);
        expect(psnr > 25).toBe(true);
    });
});
