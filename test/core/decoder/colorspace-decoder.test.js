import { describe, it, expect } from '../../utils/test-runner.js';
import { ycbcrToRgb, rgbToYcbcr } from '../../../src/core/colorspace.js';

describe('YCbCr to RGB Conversion', () => {
    it('should convert black correctly', () => {
        const result = ycbcrToRgb(0, 128, 128);
        expect(result.r).toBe(0);
        expect(result.g).toBe(0);
        expect(result.b).toBe(0);
    });

    it('should convert white correctly', () => {
        const result = ycbcrToRgb(255, 128, 128);
        expect(result.r).toBe(255);
        expect(result.g).toBe(255);
        expect(result.b).toBe(255);
    });

    it('should convert pure red correctly', () => {
        const { y, cb, cr } = rgbToYcbcr(255, 0, 0);
        const result = ycbcrToRgb(y, cb, cr);

        // Should be close to red (within tolerance due to rounding)
        expect(Math.abs(result.r - 255) <= 2).toBe(true);
        expect(Math.abs(result.g - 0) <= 2).toBe(true);
        expect(Math.abs(result.b - 0) <= 2).toBe(true);
    });

    it('should convert pure green correctly', () => {
        const { y, cb, cr } = rgbToYcbcr(0, 255, 0);
        const result = ycbcrToRgb(y, cb, cr);

        expect(Math.abs(result.r - 0) <= 2).toBe(true);
        expect(Math.abs(result.g - 255) <= 2).toBe(true);
        expect(Math.abs(result.b - 0) <= 2).toBe(true);
    });

    it('should convert pure blue correctly', () => {
        const { y, cb, cr } = rgbToYcbcr(0, 0, 255);
        const result = ycbcrToRgb(y, cb, cr);

        expect(Math.abs(result.r - 0) <= 2).toBe(true);
        expect(Math.abs(result.g - 0) <= 2).toBe(true);
        expect(Math.abs(result.b - 255) <= 2).toBe(true);
    });

    it('should clamp RGB values to 0-255 range', () => {
        // Extreme values that might produce out-of-range RGB
        const result = ycbcrToRgb(255, 0, 255);

        expect(result.r >= 0 && result.r <= 255).toBe(true);
        expect(result.g >= 0 && result.g <= 255).toBe(true);
        expect(result.b >= 0 && result.b <= 255).toBe(true);
    });

    it('should handle grayscale values', () => {
        const result = ycbcrToRgb(128, 128, 128);

        // Should produce gray (R=G=B)
        expect(result.r).toBe(128);
        expect(result.g).toBe(128);
        expect(result.b).toBe(128);
    });

    it('should roundtrip with RGB to YCbCr', () => {
        const original = { r: 100, g: 150, b: 200 };
        const { y, cb, cr } = rgbToYcbcr(original.r, original.g, original.b);
        const result = ycbcrToRgb(y, cb, cr);

        // Should be close to original (within tolerance)
        expect(Math.abs(result.r - original.r) <= 2).toBe(true);
        expect(Math.abs(result.g - original.g) <= 2).toBe(true);
        expect(Math.abs(result.b - original.b) <= 2).toBe(true);
    });

    it('should use JFIF standard formulas', () => {
        // Test with known values
        const y = 128;
        const cb = 100; // Below center
        const cr = 150; // Above center

        const result = ycbcrToRgb(y, cb, cr);

        // Verify formulas are applied correctly
        const expectedR = 128 + 1.402 * (150 - 128);
        const expectedG = 128 - 0.344136 * (100 - 128) - 0.714136 * (150 - 128);
        const expectedB = 128 + 1.772 * (100 - 128);

        expect(Math.abs(result.r - Math.round(expectedR)) <= 1).toBe(true);
        expect(Math.abs(result.g - Math.round(expectedG)) <= 1).toBe(true);
        expect(Math.abs(result.b - Math.round(expectedB)) <= 1).toBe(true);
    });

    it('should handle edge case with Cb=0, Cr=0', () => {
        const result = ycbcrToRgb(128, 0, 0);

        // Should clamp properly
        expect(result.r >= 0 && result.r <= 255).toBe(true);
        expect(result.g >= 0 && result.g <= 255).toBe(true);
        expect(result.b >= 0 && result.b <= 255).toBe(true);
    });

    it('should handle edge case with Cb=255, Cr=255', () => {
        const result = ycbcrToRgb(128, 255, 255);

        // Should clamp properly
        expect(result.r >= 0 && result.r <= 255).toBe(true);
        expect(result.g >= 0 && result.g <= 255).toBe(true);
        expect(result.b >= 0 && result.b <= 255).toBe(true);
    });
});
