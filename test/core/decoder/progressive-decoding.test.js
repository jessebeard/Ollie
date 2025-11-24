import { JpegEncoder } from '../../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../../src/core/jpeg-decoder.js';
import { describe, it, expect } from '../../../test/utils/test-runner.js';

describe('Progressive Decoding', () => {
    it('should decode a progressive JPEG correctly', () => {
        // 1. Generate Progressive JPEG
        const encoder = new JpegEncoder(50, { progressive: true });
        const width = 16;
        const height = 16;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4)
        };

        // Create a simple pattern (e.g. solid red)
        for (let i = 0; i < width * height; i++) {
            imageData.data[i * 4] = 255;     // R
            imageData.data[i * 4 + 1] = 0;   // G
            imageData.data[i * 4 + 2] = 0;   // B
            imageData.data[i * 4 + 3] = 255; // A
        }

        const jpegBytes = encoder.encode(imageData);

        // 2. Decode it
        const decoder = new JpegDecoder();
        const decoded = decoder.decode(jpegBytes);

        // 3. Verify dimensions
        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);

        // 4. Verify pixel data (approximate due to compression)
        // Red pixel: R=255, G=0, B=0
        // JPEG compression will introduce artifacts, but it should be close.
        const r = decoded.data[0];
        const g = decoded.data[1];
        const b = decoded.data[2];

        // Allow some tolerance
        expect(r).toBeGreaterThan(200);
        expect(g).toBeLessThan(50);
        expect(b).toBeLessThan(50);
    });
});
