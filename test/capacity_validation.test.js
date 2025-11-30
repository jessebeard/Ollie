import { describe, it, expect } from './utils/test-runner.js';
import { JpegEncoder } from '../src/core/jpeg-encoder.js';

describe('Capacity Validation', () => {
    function createTestImage(width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (i / 4) % 256;
            data[i + 1] = ((i / 4) * 2) % 256;
            data[i + 2] = ((i / 4) * 3) % 256;
            data[i + 3] = 255;
        }
        return { width, height, data };
    }

    it('should throw error when secret data exceeds capacity', () => {
        const imageData = createTestImage(8, 8); // Very small image
        const largeSecret = new Uint8Array(1000); // Way too large

        const encoder = new JpegEncoder(90, { secretData: largeSecret });

        let errorThrown = false;
        let errorMessage = '';

        try {
            encoder.encode(imageData);
        } catch (e) {
            errorThrown = true;
            errorMessage = e.message;
        }

        expect(errorThrown).toBe(true);
        expect(errorMessage.includes('exceeds image capacity')).toBe(true);
        expect(errorMessage.includes('1000 bytes')).toBe(true);
    });

    it('should succeed when secret data fits', () => {
        const imageData = createTestImage(64, 64);
        const smallSecret = new Uint8Array(10);

        const encoder = new JpegEncoder(90, { secretData: smallSecret });

        let success = false;
        try {
            const jpegBytes = encoder.encode(imageData);
            success = jpegBytes.length > 0;
        } catch (e) {
            success = false;
        }

        expect(success).toBe(true);
    });
});
