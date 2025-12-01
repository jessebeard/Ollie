import { describe, it, expect } from '../../test/utils/test-runner.js';
import { JpegDecoder } from '../../src/core/jpeg-decoder.js';

async function loadFixture(filename) {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = await import('fs');
        const path = await import('path');
        const url = await import('url');
        const __filename = url.fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        return fs.readFileSync(path.join(__dirname, '../fixtures', filename));
    } else {
        const response = await fetch('/test/fixtures/' + filename);
        if (!response.ok) throw new Error(`Failed to load fixture: ${filename}`);
        return new Uint8Array(await response.arrayBuffer());
    }
}

describe('JpegDecoder Integration', async () => {
    it('should decode solid black 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        const decoder = new JpegDecoder();

        const result = decoder.decode(jpegBytes);

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);
        expect(result.data.length).toBe(8 * 8 * 4); // RGBA

        // Should be mostly black (allowing for compression artifacts)
        const firstPixelR = result.data[0];
        const firstPixelG = result.data[1];
        const firstPixelB = result.data[2];
        expect(firstPixelR < 20).toBe(true);
        expect(firstPixelG < 20).toBe(true);
        expect(firstPixelB < 20).toBe(true);
    });

    it('should decode solid white 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('solid-white-8x8.jpg');
        const decoder = new JpegDecoder();

        const result = decoder.decode(jpegBytes);

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);

        // Should be mostly white (allowing for compression artifacts)
        const firstPixelR = result.data[0];
        const firstPixelG = result.data[1];
        const firstPixelB = result.data[2];
        expect(firstPixelR > 235).toBe(true);
        expect(firstPixelG > 235).toBe(true);
        expect(firstPixelB > 235).toBe(true);
    });

    it('should decode solid red 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('solid-red-8x8.jpg');
        const decoder = new JpegDecoder();

        const result = decoder.decode(jpegBytes);

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);

        // Should be mostly red (allowing for compression artifacts)
        const firstPixelR = result.data[0];
        const firstPixelG = result.data[1];
        const firstPixelB = result.data[2];
        expect(firstPixelR > 235).toBe(true);
        expect(firstPixelG < 20).toBe(true);
        expect(firstPixelB < 20).toBe(true);
    });

    it('should decode checkerboard 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('checkerboard-8x8.jpg');
        const decoder = new JpegDecoder();

        const result = decoder.decode(jpegBytes);

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);
        expect(result.data.length).toBe(8 * 8 * 4);

        // Should have variation (not all same color)
        const pixel0 = result.data[0];
        const pixel1 = result.data[4];
        expect(Math.abs(pixel0 - pixel1) > 50).toBe(true);
    });

    it('should decode gradient 16x16 JPEG', async () => {
        const jpegBytes = await loadFixture('gradient-16x16.jpg');
        const decoder = new JpegDecoder();

        const result = decoder.decode(jpegBytes);

        expect(result.width).toBe(16);
        expect(result.height).toBe(16);
        expect(result.data.length).toBe(16 * 16 * 4);
    });

    it('should decode color blocks 24x24 JPEG', async () => {
        const jpegBytes = await loadFixture('color-blocks-24x24.jpg');
        const decoder = new JpegDecoder();

        const result = decoder.decode(jpegBytes);

        expect(result.width).toBe(24);
        expect(result.height).toBe(24);
        expect(result.data.length).toBe(24 * 24 * 4);
    });

    it('should set alpha channel to 255', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        const decoder = new JpegDecoder();

        const result = decoder.decode(jpegBytes);

        // Check all alpha values
        for (let i = 3; i < result.data.length; i += 4) {
            expect(result.data[i]).toBe(255);
        }
    });

    it('should handle different quality settings', async () => {
        const q10 = await loadFixture('checkerboard-8x8-q10.jpg');
        const q90 = await loadFixture('checkerboard-8x8-q90.jpg');

        const decoder = new JpegDecoder();

        const result10 = decoder.decode(q10);
        const result90 = decoder.decode(q90);

        expect(result10.width).toBe(8);
        expect(result90.width).toBe(8);
        expect(result10.height).toBe(8);
        expect(result90.height).toBe(8);
    });

    it('should validate SOI marker', () => {
        const invalidBytes = new Uint8Array([0xFF, 0xD0]); // Not SOI
        const decoder = new JpegDecoder();

        let errorThrown = false;
        try {
            decoder.decode(invalidBytes);
        } catch (e) {
            errorThrown = true;
            expect(e.message.includes('SOI')).toBe(true);
        }
        expect(errorThrown).toBe(true);
    });

    it('should require SOF0 marker', () => {
        // Create minimal JPEG with SOI but no SOF0
        const bytes = new Uint8Array([
            0xFF, 0xD8, // SOI
            0xFF, 0xD9  // EOI
        ]);
        const decoder = new JpegDecoder();

        let errorThrown = false;
        try {
            decoder.decode(bytes);
        } catch (e) {
            errorThrown = true;
            expect(e.message.includes('SOF0') || e.message.includes('baseline')).toBe(true);
        }
        expect(errorThrown).toBe(true);
    });

    it('should reset state between decodes', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        const decoder = new JpegDecoder();

        const result1 = decoder.decode(jpegBytes);
        const result2 = decoder.decode(jpegBytes);

        expect(result1.width).toBe(result2.width);
        expect(result1.height).toBe(result2.height);
        expect(result1.data.length).toBe(result2.data.length);
    });
});
