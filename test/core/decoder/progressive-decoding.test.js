import { JpegEncoder } from '../../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../../src/core/jpeg-decoder.js';
import { describe, it, expect } from '../../../test/utils/test-runner.js';

describe('Progressive Decoding', () => {
    it('should decode a progressive JPEG correctly', async () => {
        
        const encoder = new JpegEncoder(50, { progressive: true });
        const width = 16;
        const height = 16;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4)
        };

        for (let i = 0; i < width * height; i++) {
            imageData.data[i * 4] = 255;     
            imageData.data[i * 4 + 1] = 0;   
            imageData.data[i * 4 + 2] = 0;   
            imageData.data[i * 4 + 3] = 255; 
        }

        const jpegBytes = await await encoder.encode(imageData);

        const decoder = new JpegDecoder();
        const decoded = await await decoder.decode(jpegBytes);

        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);

        const r = decoded.data[0];
        const g = decoded.data[1];
        const b = decoded.data[2];

        expect(r).toBeGreaterThan(200);
        expect(g).toBeLessThan(50);
        expect(b).toBeLessThan(50);
    });
});
