import { describe, it, expect } from '../../utils/test-runner.js';
import { quantize, getScaledQuantizationTables, QUANTIZATION_TABLE_LUMA, QUANTIZATION_TABLE_CHROMA } from '../../../src/algebraic/quantization/forward-quantization.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('Quantization', () => {
    describe('quantize', () => {
        it('quantizes a block correctly with luma table', () => {
            const block = new Float32Array(64).fill(100);
            const [quantized, err] = quantize(block, QUANTIZATION_TABLE_LUMA);
            expect(err).toEqual(null);
            expect(quantized[0]).toBe(6);   // 100/16 ≈ 6
            expect(quantized[63]).toBe(1);  // 100/99 ≈ 1
        });

        it('quantizes a zero block to all zeros', () => {
            const block = new Float32Array(64).fill(0);
            const table = new Uint8Array(64).fill(10);
            const [quantized, err] = quantize(block, table);
            expect(err).toEqual(null);

            for (let i = 0; i < 64; i++) {
                expect(quantized[i]).toBe(0);
            }
        });

        it('handles rounding correctly', () => {
            const block = new Float32Array(64);
            block[0] = 14;
            block[1] = 16;
            block[2] = -14;
            block[3] = -16;

            const table = new Uint8Array(64).fill(10);
            const [quantized, err] = quantize(block, table);
            expect(err).toEqual(null);

            expect(quantized[0]).toBe(1);   // round(14/10) = 1
            expect(quantized[1]).toBe(2);   // round(16/10) = 2
            expect(quantized[2]).toBe(-1);  // round(-14/10) = -1
            expect(quantized[3]).toBe(-2);  // round(-16/10) = -2
        });

        it('handles negative values', () => {
            const block = new Float32Array(64).fill(-50);
            const table = new Uint8Array(64).fill(10);
            const [quantized, err] = quantize(block, table);
            expect(err).toEqual(null);
            expect(quantized[0]).toBe(-5);
        });

        it('uses different quantization values per coefficient', () => {
            const block = new Float32Array(64).fill(100);
            const table = new Uint8Array(64).fill(1);
            table[0] = 10;
            table[1] = 20;
            table[2] = 50;

            const [quantized, err] = quantize(block, table);
            expect(err).toEqual(null);

            expect(quantized[0]).toBe(10);   // 100/10
            expect(quantized[1]).toBe(5);    // 100/20
            expect(quantized[2]).toBe(2);    // 100/50
            expect(quantized[3]).toBe(100);  // 100/1
        });

        it('should roundtrip with dequantize (approximate)', async () => {
            const { dequantize } = await import('../../../src/algebraic/quantization/inverse-quantization.js');

            const original = new Float32Array(64).fill(100);
            const table = new Int32Array(64).fill(10);

            const [quantized, e1] = quantize(original, table);
            expect(e1).toEqual(null);
            const [reconstructed, e2] = dequantize(quantized, table);
            expect(e2).toEqual(null);

            for (let i = 0; i < 64; i++) {
                expect(reconstructed[i]).toBeCloseTo(original[i], 1);
            }
        });

        it('Property: quantize(zero_block, any_table) = zero_block', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 255)],
                (tableVal) => {
                    const block = new Float32Array(64).fill(0);
                    const table = new Uint8Array(64).fill(tableVal);
                    const [quantized, err] = quantize(block, table);
                    expect(err).toBe(null);
                    for (let i = 0; i < 64; i++) {
                        expect(quantized[i]).toBe(0);
                    }
                },
                50
            );
        });

        it('Property: sign of quantized matches sign of input', async () => {
            await assertProperty(
                [Arbitrary.integer(-1000, 1000)],
                (val) => {
                    const block = new Float32Array(64).fill(val);
                    const table = new Uint8Array(64).fill(10);
                    const [quantized, err] = quantize(block, table);
                    expect(err).toBe(null);
                    // If |val| > 5 then quantized sign should match input sign
                    if (Math.abs(val) > 5) {
                        expect(Math.sign(quantized[0])).toBe(Math.sign(val));
                    }
                },
                50
            );
        });
    });

    describe('getScaledQuantizationTables', () => {
        it('should return luma and chroma tables', () => {
            const [tables, err] = getScaledQuantizationTables(50);
            expect(err).toEqual(null);
            expect(tables.luma).toBeDefined();
            expect(tables.chroma).toBeDefined();
            expect(tables.luma.length).toBe(64);
            expect(tables.chroma.length).toBe(64);
        });

        it('should clamp quality to [1, 100]', () => {
            const [t1, e1] = getScaledQuantizationTables(0);
            expect(e1).toEqual(null);
            const [t2, e2] = getScaledQuantizationTables(200);
            expect(e2).toEqual(null);
            const [t3, e3] = getScaledQuantizationTables(1);
            expect(e3).toEqual(null);

            // quality=0 clamped to 1 should equal quality=1
            for (let i = 0; i < 64; i++) {
                expect(t1.luma[i]).toBe(t3.luma[i]);
            }
        });

        it('should return all values in [1, 255]', () => {
            const [tables, err] = getScaledQuantizationTables(50);
            expect(err).toEqual(null);
            for (let i = 0; i < 64; i++) {
                expect(tables.luma[i] >= 1 && tables.luma[i] <= 255).toBe(true);
                expect(tables.chroma[i] >= 1 && tables.chroma[i] <= 255).toBe(true);
            }
        });

        it('quality=100 should produce smallest quantization values', () => {
            const [q100, e1] = getScaledQuantizationTables(100);
            expect(e1).toEqual(null);
            const [q1, e2] = getScaledQuantizationTables(1);
            expect(e2).toEqual(null);

            // Low quality = high quantization values, high quality = low
            let q100sum = 0, q1sum = 0;
            for (let i = 0; i < 64; i++) {
                q100sum += q100.luma[i];
                q1sum += q1.luma[i];
            }
            expect(q100sum).toBeLessThan(q1sum);
        });

        it('Property: all table values in [1, 255] for any quality', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 100)],
                (quality) => {
                    const [tables, err] = getScaledQuantizationTables(quality);
                    if (err) return false;
                    for (let i = 0; i < 64; i++) {
                        if (tables.luma[i] < 1 || tables.luma[i] > 255) return false;
                        if (tables.chroma[i] < 1 || tables.chroma[i] > 255) return false;
                    }
                    return true;
                },
                50
            );
        });

        it('should cache results for same quality', () => {
            const [t1] = getScaledQuantizationTables(75);
            const [t2] = getScaledQuantizationTables(75);
            // Same reference (cached)
            expect(t1.luma === t2.luma).toBe(true);
        });
    });

    describe('Standard Tables', () => {
        it('QUANTIZATION_TABLE_LUMA has 64 elements', () => {
            expect(QUANTIZATION_TABLE_LUMA.length).toBe(64);
        });

        it('QUANTIZATION_TABLE_CHROMA has 64 elements', () => {
            expect(QUANTIZATION_TABLE_CHROMA.length).toBe(64);
        });

        it('Standard tables have values in valid range', () => {
            for (let i = 0; i < 64; i++) {
                expect(QUANTIZATION_TABLE_LUMA[i] >= 1 && QUANTIZATION_TABLE_LUMA[i] <= 255).toBe(true);
                expect(QUANTIZATION_TABLE_CHROMA[i] >= 1 && QUANTIZATION_TABLE_CHROMA[i] <= 255).toBe(true);
            }
        });
    });
});
