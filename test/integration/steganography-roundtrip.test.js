import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';

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

        const width = 64;
        const height = 64;
        const original = createNoiseImage(width, height);

        const secretText = "This is a secret message hidden in the pixels!";
        const secretData = new TextEncoder().encode(secretText);

        const encoder = new JpegEncoder(90, { secretData });
        const decoder = new JpegDecoder();

        const jpegBytes = await encoder.encode(original);
        const [decoded, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);

        expect(decoded.secretData).toBeDefined();
        expect(decoded.secretData.length).toBe(secretData.length);

        const decodedText = new TextDecoder().decode(decoded.secretData);
        expect(decodedText).toBe(secretText);
    });

    it('should handle data too large for capacity (graceful failure)', async () => {

        const width = 8;
        const height = 8;
        const original = createNoiseImage(width, height);

        const secretData = new Uint8Array(100).fill(65);

        const encoder = new JpegEncoder(90, { secretData });

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
