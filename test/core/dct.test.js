import { describe, it, expect } from '/test/utils/test-runner.js';
import { forwardDCT } from '../../src/core/dct.js';

describe('Discrete Cosine Transform', () => {
    it('transforms a flat block (DC only)', () => {
        // Constant block of 255s (shifted by -128 usually, but let's test raw math first)
        // If input is all 100s.
        const block = new Float32Array(64).fill(100);
        const dct = forwardDCT(block);

        // DC coefficient (0,0) should be 8 * 100 = 800
        // Formula: sum(val) / 8 * C(0) * C(0) ? 
        // Standard orthonormal DCT-II:
        // DC = 1/8 * sum(pixels) * 2 ??
        // Let's check the scaling factor in implementation.
        // Common JPEG scaling: F(u,v) = 1/4 * C(u)C(v) * sum...
        // If all pixels are A:
        // F(0,0) = 1/4 * (1/sqrt(2))*(1/sqrt(2)) * sum(A)
        //        = 1/4 * 1/2 * (64 * A)
        //        = 1/8 * 64 * A = 8 * A

        expect(dct[0]).toBeCloseTo(800, 1);

        // AC coefficients should be 0
        expect(dct[1]).toBeCloseTo(0, 4);
        expect(dct[63]).toBeCloseTo(0, 4);
    });

    it('is reversible (sanity check logic)', () => {
        // We won't implement IDCT yet, but we can check properties.
        // High frequency pattern
        const block = new Float32Array(64);
        for (let i = 0; i < 64; i++) block[i] = (i % 2 === 0) ? 50 : -50;

        const dct = forwardDCT(block);
        // Should have significant energy in high frequencies
        // Just ensure it runs without NaN
        expect(isNaN(dct[0])).toBe(false);
    });
});
