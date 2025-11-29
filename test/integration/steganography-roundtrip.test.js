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

    it('should roundtrip secret data', () => {
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

        const jpegBytes = encoder.encode(original);
        const decoded = decoder.decode(jpegBytes);

        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);

        expect(decoded.secretData).toBeDefined();
        expect(decoded.secretData.length).toBe(secretData.length);

        const decodedText = new TextDecoder().decode(decoded.secretData);
        expect(decodedText).toBe(secretText);
    });

    it('should handle data too large for capacity (graceful failure)', () => {
        // Small image, lots of data
        const width = 8;
        const height = 8; // 1 block
        const original = createNoiseImage(width, height);

        // 1 block has max 63 bits capacity (minus header 32 bits = 31 bits = ~3 bytes)
        // Try to stuff 100 bytes
        const secretData = new Uint8Array(100).fill(65);

        const encoder = new JpegEncoder(90, { secretData });
        const decoder = new JpegDecoder();

        // Should not crash
        const jpegBytes = encoder.encode(original);
        const decoded = decoder.decode(jpegBytes);

        // Decoder might find garbage or nothing, but shouldn't crash
        // Since encoder truncates or fails to embed fully, the length header might be missing or corrupt.
        // If header is missing/corrupt, extract returns null.
        // Or if header is written but data is truncated, extract might fail or return partial.
        // Our Jsteg implementation returns false on embed failure, so it might embed nothing or partial.
        // If it returns false, it stops embedding.
        // If it stops before writing header, decoder sees nothing.
        // If it writes header but fails later, decoder sees valid length but runs out of bits -> returns null.

        // So we expect secretData to be undefined or null
        if (decoded.secretData) {
            // If it managed to extract something, it shouldn't be the full data
            expect(decoded.secretData.length).not.toBe(100);
        }
    });
});
