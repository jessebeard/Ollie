import { describe, it, expect } from '../utils/test-runner.js';
import { forwardDCT } from '../../src/core/dct.js';

describe('Discrete Cosine Transform', () => {
    it('transforms a zero block to all zeros', () => {
        const block = new Float32Array(64).fill(0);
        const dct = forwardDCT(block);
        for (let i = 0; i < 64; i++) {
            expect(dct[i]).toBeCloseTo(0, 5);
        }
    });

    it('transforms a flat block (DC only)', () => {
        const block = new Float32Array(64).fill(100);
        const dct = forwardDCT(block);

        // DC coefficient should be 8 * 100 = 800
        expect(dct[0]).toBeCloseTo(800, 1);

        // AC coefficients should be 0
        for (let i = 1; i < 64; i++) {
            expect(dct[i]).toBeCloseTo(0, 3);
        }
    });

    it('is linear (DCT(A + B) = DCT(A) + DCT(B))', () => {
        const blockA = new Float32Array(64).map((_, i) => i);
        const blockB = new Float32Array(64).map((_, i) => 64 - i);
        const blockSum = new Float32Array(64).map((_, i) => blockA[i] + blockB[i]);

        const dctA = forwardDCT(blockA);
        const dctB = forwardDCT(blockB);
        const dctSum = forwardDCT(blockSum);

        for (let i = 0; i < 64; i++) {
            expect(dctSum[i]).toBeCloseTo(dctA[i] + dctB[i], 3);
        }
    });

    it('scales linearly (DCT(k * A) = k * DCT(A))', () => {
        const block = new Float32Array(64).map((_, i) => i);
        const k = 2.5;
        const blockScaled = new Float32Array(64).map((_, i) => block[i] * k);

        const dct = forwardDCT(block);
        const dctScaled = forwardDCT(blockScaled);

        for (let i = 0; i < 64; i++) {
            expect(dctScaled[i]).toBeCloseTo(dct[i] * k, 3);
        }
    });

    it('handles impulse response (single pixel set)', () => {
        // Setting only (0,0) to 1 should produce a specific pattern
        const block = new Float32Array(64).fill(0);
        block[0] = 1;
        const dct = forwardDCT(block);

        // DC should be 1/8 * 1 = 0.125
        // Formula check: F(0,0) = 1/8 * sum(f(x,y)) = 0.125
        expect(dct[0]).toBeCloseTo(0.125, 3);
    });

    it('produces symmetric output for symmetric input', () => {
        // Create a horizontally symmetric block
        const block = new Float32Array(64);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                block[y * 8 + x] = Math.min(x, 7 - x);
            }
        }

        const dct = forwardDCT(block);

        // Odd horizontal frequencies should be zero (due to symmetry)
        // u=1, 3, 5, 7
        for (let u = 1; u < 8; u += 2) {
            for (let v = 0; v < 8; v++) {
                expect(dct[v * 8 + u]).toBeCloseTo(0, 3);
            }
        }
    });

    it('handles negative input values', () => {
        const block = new Float32Array(64).fill(-128);
        const dct = forwardDCT(block);

        // DC should be 8 * -128 = -1024
        expect(dct[0]).toBeCloseTo(-1024, 1);
    });

    it('is reversible (sanity check logic)', () => {
        const block = new Float32Array(64);
        for (let i = 0; i < 64; i++) block[i] = (i % 2 === 0) ? 50 : -50;

        const dct = forwardDCT(block);
        expect(isNaN(dct[0])).toBe(false);
    });

    it('should roundtrip with inverse DCT (IDCT)', async () => {
        const { idct } = await import('../../src/core/decoder/idct.js');

        const original = new Float32Array(64);
        for (let i = 0; i < 64; i++) original[i] = i;

        const dct = forwardDCT(original);
        const reconstructed = idct(dct);

        for (let i = 0; i < 64; i++) {
            expect(reconstructed[i]).toBeCloseTo(original[i], 1);
        }
    });

    it('should roundtrip random data with IDCT', async () => {
        const { idct } = await import('../../src/core/decoder/idct.js');

        const original = new Float32Array(64);
        for (let i = 0; i < 64; i++) original[i] = Math.random() * 255 - 128;

        const dct = forwardDCT(original);
        const reconstructed = idct(dct);

        for (let i = 0; i < 64; i++) {
            expect(reconstructed[i]).toBeCloseTo(original[i], 1);
        }
    });
});
