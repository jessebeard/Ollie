import { describe, it, expect } from './utils/test-runner.js';
import { JpegEncoder } from '../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../src/core/jpeg-decoder.js';

describe('Steganography Auto-Detection Roundtrip', () => {
    function createTestImage(width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (i / 4) % 256;     // R
            data[i + 1] = ((i / 4) * 2) % 256; // G
            data[i + 2] = ((i / 4) * 3) % 256; // B
            data[i + 3] = 255;           // A
        }
        return { width, height, data };
    }

    it('should roundtrip with legacy format (current encoder behavior)', async () => {
        const imageData = createTestImage(64, 64);
        const secretText = 'Hello, World!';
        const secretData = new TextEncoder().encode(secretText);

        // Encode with secret data (uses legacy format)
        const encoder = new JpegEncoder(90, { secretData });
        const jpegBytes = await encoder.encode(imageData);

        // Decode (should auto-detect legacy format)
        const decoder = new JpegDecoder();
        const decoded = await decoder.decode(jpegBytes);

        expect(decoded.secretData).toBeDefined();
        expect(decoded.secretData.length).toBe(secretData.length);

        const decodedText = new TextDecoder().decode(decoded.secretData);
        expect(decodedText).toBe(secretText);
    });

    it('should handle images without secret data', async () => {
        const imageData = createTestImage(64, 64);

        const encoder = new JpegEncoder(90);
        const jpegBytes = await encoder.encode(imageData);

        const decoder = new JpegDecoder();
        const decoded = await decoder.decode(jpegBytes);

        // Should not have secretData or it should be null/undefined
        expect(decoded.secretData === null || decoded.secretData === undefined).toBe(true);
    });
});
