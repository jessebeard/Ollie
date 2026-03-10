import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';

describe('Steganography Auto-Detection Roundtrip', () => {
    function createTestImage(width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            // Use random noise for high-frequency content that doesn't compress away
            data[i] = Math.floor(Math.random() * 256);
            data[i + 1] = Math.floor(Math.random() * 256);
            data[i + 2] = Math.floor(Math.random() * 256);
            data[i + 3] = 255;
        }
        return { width, height, data };
    }

    it('should roundtrip with legacy format (current encoder behavior)', async () => {
        const imageData = createTestImage(256, 256);
        const secretText = 'Hello, World!';
        const secretData = new TextEncoder().encode(secretText);

        const encoder = new JpegEncoder(90, { secretData });
        const jpegBytes = await encoder.encode(imageData);

        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(decoded.secretData).toBeDefined();
        expect(decoded.secretData.length).toBe(secretData.length);

        const decodedText = new TextDecoder().decode(decoded.secretData);
        expect(decodedText).toBe(secretText);
    });

    it('should handle images without secret data', async () => {
        const imageData = createTestImage(256, 256);

        const encoder = new JpegEncoder(90);
        const jpegBytes = await encoder.encode(imageData);

        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(decoded.secretData === null || decoded.secretData === undefined).toBe(true);
    });
});
