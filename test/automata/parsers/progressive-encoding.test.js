import { JpegEncoder } from '../../../src/codec/encoder.js';
import { describe, it, expect } from '../../utils/test-runner.js';

describe('Progressive Encoding', () => {
    it('should generate multiple SOS markers when progressive mode is enabled', async () => {
        const encoder = new JpegEncoder(50, { progressive: true });
        const width = 16;
        const height = 16;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4).fill(128)
        };

        const jpegBytes = await await encoder.encode(imageData);

        let sosCount = 0;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xDA) {
                sosCount++;
            }
        }

        expect(sosCount).toBeGreaterThan(1);
    });

    it('should generate SOF2 (Progressive DCT) instead of SOF0 (Baseline DCT)', async () => {
        const encoder = new JpegEncoder(50, { progressive: true });
        const width = 8;
        const height = 8;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4).fill(0)
        };

        const jpegBytes = await await encoder.encode(imageData);

        let hasSOF2 = false;
        let hasSOF0 = false;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF) {
                if (jpegBytes[i + 1] === 0xC2) hasSOF2 = true;
                if (jpegBytes[i + 1] === 0xC0) hasSOF0 = true;
            }
        }

        expect(hasSOF2).toBe(true);
        expect(hasSOF0).toBe(false);
    });
});
