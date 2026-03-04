import { describe, it, expect } from '../../utils/test-runner.js';
import { forwardDCT, forwardDCTNaive, forwardDCTAAN } from '../../../src/core/encoder/dct.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('Discrete Cosine Transform', () => {
    describe('forwardDCT (default/naive)', () => {
        it('transforms a zero block to all zeros', () => {
            const block = new Float32Array(64).fill(0);
            const [dct, err] = forwardDCT(block);
            expect(err).toEqual(null);
            for (let i = 0; i < 64; i++) {
                expect(dct[i]).toBeCloseTo(0, 5);
            }
        });

        it('transforms a flat block (DC only)', () => {
            const block = new Float32Array(64).fill(100);
            const [dct, err] = forwardDCT(block);
            expect(err).toEqual(null);
            expect(dct[0]).toBeCloseTo(800, 1);

            for (let i = 1; i < 64; i++) {
                expect(dct[i]).toBeCloseTo(0, 3);
            }
        });

        it('is linear: DCT(A + B) = DCT(A) + DCT(B)', () => {
            const blockA = new Float32Array(64).map((_, i) => i);
            const blockB = new Float32Array(64).map((_, i) => 64 - i);
            const blockSum = new Float32Array(64).map((_, i) => blockA[i] + blockB[i]);

            const [dctA] = forwardDCT(blockA);
            const [dctB] = forwardDCT(blockB);
            const [dctSum] = forwardDCT(blockSum);

            for (let i = 0; i < 64; i++) {
                expect(dctSum[i]).toBeCloseTo(dctA[i] + dctB[i], 3);
            }
        });

        it('scales linearly: DCT(k * A) = k * DCT(A)', () => {
            const block = new Float32Array(64).map((_, i) => i);
            const k = 2.5;
            const blockScaled = new Float32Array(64).map((_, i) => block[i] * k);

            const [dct] = forwardDCT(block);
            const [dctScaled] = forwardDCT(blockScaled);

            for (let i = 0; i < 64; i++) {
                expect(dctScaled[i]).toBeCloseTo(dct[i] * k, 3);
            }
        });

        it('handles impulse response (single pixel set)', () => {
            const block = new Float32Array(64).fill(0);
            block[0] = 1;
            const [dct, err] = forwardDCT(block);
            expect(err).toEqual(null);
            expect(dct[0]).toBeCloseTo(0.125, 3);
        });

        it('handles negative input values', () => {
            const block = new Float32Array(64).fill(-128);
            const [dct, err] = forwardDCT(block);
            expect(err).toEqual(null);
            expect(dct[0]).toBeCloseTo(-1024, 1);
        });

        it('should return error on invalid block length', () => {
            const invalid = new Float32Array(32);
            const [result, err] = forwardDCT(invalid);
            expect(result).toEqual(null);
            expect(err).toBeDefined();
            expect(err.message).toBe('Invalid block length: 32 (expected 64)');
        });

        it('should roundtrip with inverse DCT (IDCT)', async () => {
            const { idctNaive } = await import('../../../src/core/decoder/idct.js');

            const original = new Float32Array(64);
            for (let i = 0; i < 64; i++) original[i] = i;

            const [dct, e1] = forwardDCT(original);
            expect(e1).toEqual(null);
            const [reconstructed, e2] = idctNaive(dct);
            expect(e2).toEqual(null);

            for (let i = 0; i < 64; i++) {
                expect(reconstructed[i]).toBeCloseTo(original[i], 1);
            }
        });

        it('Property: DCT/IDCT roundtrip within tolerance for random blocks', async () => {
            const { idctNaive } = await import('../../../src/core/decoder/idct.js');

            await assertProperty(
                [Arbitrary.integer(-128, 127)],
                (seed) => {
                    const original = new Float32Array(64);
                    for (let i = 0; i < 64; i++) original[i] = seed + (i % 8) * 3;

                    const [dct, e1] = forwardDCT(original);
                    if (e1) return false;
                    const [reconstructed, e2] = idctNaive(dct);
                    if (e2) return false;

                    for (let i = 0; i < 64; i++) {
                        if (Math.abs(reconstructed[i] - original[i]) > 0.5) return false;
                    }
                    return true;
                },
                30
            );
        });
    });

    describe('forwardDCTAAN', () => {
        it('transforms zero block to all zeros', () => {
            const block = new Float32Array(64).fill(0);
            const [dct, err] = forwardDCTAAN(block);
            expect(err).toEqual(null);
            for (let i = 0; i < 64; i++) {
                expect(dct[i]).toBeCloseTo(0, 3);
            }
        });

        it('transforms flat block (DC only)', () => {
            const block = new Float32Array(64).fill(100);
            const [dct, err] = forwardDCTAAN(block);
            expect(err).toEqual(null);
            expect(dct[0]).toBeCloseTo(800, 0);
        });

        it('should return error on invalid block length', () => {
            const invalid = new Float32Array(16);
            const [result, err] = forwardDCTAAN(invalid);
            expect(result).toEqual(null);
            expect(err).toBeDefined();
        });

        it('Property: AAN matches Naive within tolerance', async () => {
            await assertProperty(
                [Arbitrary.integer(-128, 127)],
                (seed) => {
                    const block = new Float32Array(64);
                    for (let i = 0; i < 64; i++) block[i] = seed + i;

                    const [naiveResult] = forwardDCTNaive(block);
                    const [aanResult] = forwardDCTAAN(block);

                    for (let i = 0; i < 64; i++) {
                        if (Math.abs(naiveResult[i] - aanResult[i]) > 1.0) return false;
                    }
                    return true;
                },
                30
            );
        });
    });
});
