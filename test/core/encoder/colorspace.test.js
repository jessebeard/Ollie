import { describe, it, expect } from '../../utils/test-runner.js';
import { rgbToYcbcr, ycbcrToRgb } from '../../../src/core/encoder/colorspace.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('Color Space Conversion', () => {
    it('converts black correctly', () => {
        const [result, err] = rgbToYcbcr(0, 0, 0);
        expect(err).toEqual(null);
        expect(result.y).toBeCloseTo(0, 1);
        expect(result.cb).toBeCloseTo(128, 1);
        expect(result.cr).toBeCloseTo(128, 1);
    });

    it('converts white correctly', () => {
        const [result, err] = rgbToYcbcr(255, 255, 255);
        expect(err).toEqual(null);
        expect(result.y).toBeCloseTo(255, 1);
        expect(result.cb).toBeCloseTo(128, 1);
        expect(result.cr).toBeCloseTo(128, 1);
    });

    it('converts red correctly', () => {
        const [result, err] = rgbToYcbcr(255, 0, 0);
        expect(err).toEqual(null);
        expect(result.y).toBeCloseTo(76, 0);
        expect(result.cb).toBeCloseTo(85, 0);
        expect(result.cr).toBeCloseTo(255, 0);
    });

    it('converts blue correctly', () => {
        const [result, err] = rgbToYcbcr(0, 0, 255);
        expect(err).toEqual(null);
        expect(result.y).toBeCloseTo(29, 0);
        expect(result.cb).toBeCloseTo(255, 0);
        expect(result.cr).toBeCloseTo(107, 0);
    });

    it('handles grayscale values (R=G=B)', () => {
        const val = 123;
        const [result, err] = rgbToYcbcr(val, val, val);
        expect(err).toEqual(null);
        expect(result.y).toBeCloseTo(val, 1);
        expect(result.cb).toBeCloseTo(128, 1);
        expect(result.cr).toBeCloseTo(128, 1);
    });

    it('clamps output to valid range', () => {
        const [result, err] = rgbToYcbcr(300, 300, 300);
        expect(err).toEqual(null);
        expect(result.y).toBe(255);
        expect(result.cb).toBe(128);
        expect(result.cr).toBe(128);
    });

    it('ycbcrToRgb converts known values', () => {
        const [result, err] = ycbcrToRgb(76, 85, 255);
        expect(err).toEqual(null);
        expect(Math.abs(result.r - 255)).toBeLessThanOrEqual(2);
        expect(Math.abs(result.g - 0)).toBeLessThanOrEqual(2);
        expect(Math.abs(result.b - 0)).toBeLessThanOrEqual(2);
    });

    it('should roundtrip RGB -> YCbCr -> RGB (specific)', () => {
        const r = 100, g = 150, b = 200;
        const [ycbcr, e1] = rgbToYcbcr(r, g, b);
        expect(e1).toEqual(null);
        const [result, e2] = ycbcrToRgb(ycbcr.y, ycbcr.cb, ycbcr.cr);
        expect(e2).toEqual(null);

        expect(Math.abs(result.r - r)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.g - g)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.b - b)).toBeLessThanOrEqual(1);
    });

    it('Property: RGB -> YCbCr -> RGB roundtrip within ±2', async () => {
        await assertProperty(
            [Arbitrary.integer(0, 255), Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
            (r, g, b) => {
                const [ycbcr, e1] = rgbToYcbcr(r, g, b);
                if (e1) return false;
                const [result, e2] = ycbcrToRgb(ycbcr.y, ycbcr.cb, ycbcr.cr);
                if (e2) return false;
                return Math.abs(result.r - r) <= 2 &&
                    Math.abs(result.g - g) <= 2 &&
                    Math.abs(result.b - b) <= 2;
            },
            100
        );
    });

    it('Property: grayscale inputs always produce Cb≈128, Cr≈128', async () => {
        await assertProperty(
            [Arbitrary.integer(0, 255)],
            (val) => {
                const [result, err] = rgbToYcbcr(val, val, val);
                if (err) return false;
                return Math.abs(result.cb - 128) <= 1 &&
                    Math.abs(result.cr - 128) <= 1;
            },
            100
        );
    });

    it('Property: Y output is always in [0, 255]', async () => {
        await assertProperty(
            [Arbitrary.integer(0, 255), Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
            (r, g, b) => {
                const [result, err] = rgbToYcbcr(r, g, b);
                if (err) return false;
                return result.y >= 0 && result.y <= 255 &&
                    result.cb >= 0 && result.cb <= 255 &&
                    result.cr >= 0 && result.cr <= 255;
            },
            100
        );
    });
});
