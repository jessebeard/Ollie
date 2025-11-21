import { describe, it, expect } from '/src/utils/test-runner.js';
import { JpegEncoder } from './jpeg-encoder.js';

describe('JpegEncoder Integration', () => {
    it('encodes a small 8x8 white block without errors', () => {
        const width = 8;
        const height = 8;
        const data = new Uint8Array(width * height * 4);

        // Fill with white (255, 255, 255, 255)
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255;     // R
            data[i + 1] = 255; // G
            data[i + 2] = 255; // B
            data[i + 3] = 255; // A
        }

        const imageData = { width, height, data };
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode(imageData);

        expect(jpegBytes).toBeDefined();
        expect(jpegBytes.length).toBeGreaterThan(0);

        // Check for SOI (FF D8)
        expect(jpegBytes[0]).toBe(0xFF);
        expect(jpegBytes[1]).toBe(0xD8);

        // Check for EOI (FF D9) at the end
        expect(jpegBytes[jpegBytes.length - 2]).toBe(0xFF);
        expect(jpegBytes[jpegBytes.length - 1]).toBe(0xD9);
    });

    it('encodes a 16x16 image (multiple blocks)', () => {
        const width = 16;
        const height = 16;
        const data = new Uint8Array(width * height * 4);

        // Fill with random data
        for (let i = 0; i < data.length; i++) {
            data[i] = i % 255;
        }

        const imageData = { width, height, data };
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode(imageData);

        expect(jpegBytes.length).toBeGreaterThan(0);
        expect(jpegBytes[0]).toBe(0xFF);
        expect(jpegBytes[1]).toBe(0xD8);
        expect(jpegBytes[jpegBytes.length - 2]).toBe(0xFF);
        expect(jpegBytes[jpegBytes.length - 1]).toBe(0xD9);
    });
});
