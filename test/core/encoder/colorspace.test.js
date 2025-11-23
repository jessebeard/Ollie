import { describe, it, expect } from '../../utils/test-runner.js';
import { rgbToYcbcr, ycbcrToRgb } from '../../../src/core/encoder/colorspace.js';

describe('Color Space Conversion', () => {
    it('converts black correctly', () => {
        const { y, cb, cr } = rgbToYcbcr(0, 0, 0);
        expect(y).toBeCloseTo(0, 1);
        expect(cb).toBeCloseTo(128, 1);
        expect(cr).toBeCloseTo(128, 1);
    });

    it('converts white correctly', () => {
        const { y, cb, cr } = rgbToYcbcr(255, 255, 255);
        expect(y).toBeCloseTo(255, 1);
        expect(cb).toBeCloseTo(128, 1);
        expect(cr).toBeCloseTo(128, 1);
    });
    it('converts red correctly', () => {
        const { y, cb, cr } = rgbToYcbcr(255, 0, 0);
        // Y = 0.299*255 = 76.2
        // Cb = 128 - 0.1687*255 = 84.9
        // Cr = 128 + 0.5*255 = 255.5
        expect(y).toBeCloseTo(76, 0);
        expect(cb).toBeCloseTo(85, 0);
        expect(cr).toBeCloseTo(255, 0);
    });

    it('converts blue correctly', () => {
        const { y, cb, cr } = rgbToYcbcr(0, 0, 255);
        // Y = 0.114*255 = 29.1
        expect(y).toBeCloseTo(29, 0);
    });

    it('handles grayscale values (R=G=B)', () => {
        const val = 123;
        const { y, cb, cr } = rgbToYcbcr(val, val, val);
        expect(y).toBeCloseTo(val, 1);
        expect(cb).toBeCloseTo(128, 1);
        expect(cr).toBeCloseTo(128, 1);
    });

    it('clamps output values (conceptually)', () => {
        // Just verifying it runs without error for now
        const { y, cb, cr } = rgbToYcbcr(300, 300, 300);
        expect(y).toBeDefined();
    });

    it('should roundtrip RGB -> YCbCr -> RGB', () => {
        const r = 100, g = 150, b = 200;
        const { y, cb, cr } = rgbToYcbcr(r, g, b);
        const result = ycbcrToRgb(y, cb, cr);

        // Allow off-by-one due to rounding
        expect(Math.abs(result.r - r)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.g - g)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.b - b)).toBeLessThanOrEqual(1);
    });

    it('should roundtrip random colors', () => {
        for (let i = 0; i < 10; i++) {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);

            const { y, cb, cr } = rgbToYcbcr(r, g, b);
            const result = ycbcrToRgb(y, cb, cr);

            // Allow small error due to integer rounding in YCbCr conversion
            expect(Math.abs(result.r - r)).toBeLessThanOrEqual(2);
            expect(Math.abs(result.g - g)).toBeLessThanOrEqual(2);
            expect(Math.abs(result.b - b)).toBeLessThanOrEqual(2);
        }
    });
});
