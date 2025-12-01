import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../src/core/jpeg-decoder.js';

describe('Steganography Roundtrip', () => {
    function createNoiseImage(width, height) {
        const imageData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            imageData[i * 4 + 0] = Math.floor(Math.random() * 256);
            imageData[i * 4 + 1] = Math.floor(Math.random() * 256);
            imageData[i * 4 + 2] = Math.floor(Math.random() * 256);
            imageData[i * 4 + 3] = 255;
        }
        return { data: imageData, width, height };
    }

    it('should roundtrip secret data', async () => {
        // Use a large enough image to hold the data
        // 64x64 image = 64 blocks.
        // Each block has ~63 AC coeffs.
        // Capacity depends on non-zeros. Noise image has high entropy -> many non-zeros.
        const width = 64;
        const height = 64;
        const original = createNoiseImage(width, height);

        const secretText = "This is a secret message hidden in the pixels!";
        const secretData = new TextEncoder().encode(secretText);

        const encoder = new JpegEncoder(90, { secretData });
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original);
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);

        expect(decoded.secretData).toBeDefined();
        expect(decoded.secretData.length).toBe(secretData.length);

        const decodedText = new TextDecoder().decode(decoded.secretData);
        expect(decodedText).toBe(secretText);
    });

    it('should handle data too large for capacity (graceful failure)', async () => {
        // Small image, lots of data
        const width = 8;
        const height = 8; // 1 block
        const original = createNoiseImage(width, height);

        // 1 block has max 63 bits capacity (minus header bytes)
        // Try to stuff 100 bytes - should throw error
        const secretData = new Uint8Array(100).fill(65);

        const encoder = new JpegEncoder(90, { secretData });

        // Encoder should throw error when data exceeds capacity
        let errorThrown = false;
        try {
            await encoder.encode(original);
        } catch (e) {
            errorThrown = true;
            expect(e.message.includes('exceeds image capacity')).toBe(true);
        }

        expect(errorThrown).toBe(true);
    });
});
