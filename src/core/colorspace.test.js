import { describe, it, expect } from '/src/utils/test-runner.js';
import { rgbToYcbcr, ycbcrToRgb } from './colorspace.js';

describe('Color Space Conversion', () => {
    it('converts black correctly', () => {
        const result = rgbToYcbcr(0, 0, 0);
        expect(result.y).toBe(0);
        expect(result.cb).toBe(128);
        expect(result.cr).toBe(128);
    });

    it('converts white correctly', () => {
        const result = rgbToYcbcr(255, 255, 255);
        expect(result.y).toBe(255);
        expect(result.cb).toBe(128);
        expect(result.cr).toBe(128);
    });

    it('converts red correctly', () => {
        // R=255, G=0, B=0
        // Y  =  0.299*255 = 76.245 -> 76
        // Cb = -0.1687*255 + 128 = 84.98 -> 85
        // Cr =  0.5*255 + 128 = 255.5 -> 255
        const result = rgbToYcbcr(255, 0, 0);
        expect(result.y).toBeCloseTo(76, 0);
        expect(result.cb).toBeCloseTo(85, 0);
        expect(result.cr).toBeCloseTo(256, 0);
    });
});
