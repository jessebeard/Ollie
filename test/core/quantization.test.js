import { describe, it, expect } from '../utils/test-runner.js';
import { quantize, QUANTIZATION_TABLE_LUMA, QUANTIZATION_TABLE_CHROMA } from '../../src/core/quantization.js';

describe('Quantization', () => {
    it('quantizes a block correctly', () => {
        // Create a block with known values
        const block = new Float32Array(64).fill(100);

        // Luma table[0] is 16
        // 100 / 16 = 6.25 -> round to 6

        const quantized = quantize(block, QUANTIZATION_TABLE_LUMA);
        expect(quantized[0]).toBe(6);

        // Luma table[63] is 99
        // 100 / 99 = 1.01 -> round to 1
        expect(quantized[63]).toBe(1);
    });

    it('quantizes a zero block to all zeros', () => {
        const block = new Float32Array(64).fill(0);
        const table = new Uint8Array(64).fill(10);
        const quantized = quantize(block, table);

        for (let i = 0; i < 64; i++) {
            expect(quantized[i]).toBe(0);
        }
    });

    it('quantizes a block correctly (basic division)', () => {
        const block = new Float32Array(64).fill(100);
        const table = new Uint8Array(64).fill(10);
        const quantized = quantize(block, table);

        // 100 / 10 = 10
        expect(quantized[0]).toBe(10);
    });

    it('handles rounding correctly', () => {
        const block = new Float32Array(64);
        block[0] = 14; // 14 / 10 = 1.4 -> 1
        block[1] = 16; // 16 / 10 = 1.6 -> 2
        block[2] = -14; // -14 / 10 = -1.4 -> -1
        block[3] = -16; // -16 / 10 = -1.6 -> -2

        const table = new Uint8Array(64).fill(10);
        const quantized = quantize(block, table);

        expect(quantized[0]).toBe(1);
        expect(quantized[1]).toBe(2);
        expect(quantized[2]).toBe(-1);
        expect(quantized[3]).toBe(-2);
    });

    it('handles negative values', () => {
        const block = new Float32Array(64).fill(-50);
        const table = new Uint8Array(64).fill(10);
        const quantized = quantize(block, table);

        expect(quantized[0]).toBe(-5);
    });

    it('uses different quantization values per coefficient', () => {
        const block = new Float32Array(64).fill(100);
        const table = new Uint8Array(64).fill(1);
        table[0] = 10;
        table[1] = 20;
        table[2] = 50;

        const quantized = quantize(block, table);

        expect(quantized[0]).toBe(10); // 100 / 10
        expect(quantized[1]).toBe(5);  // 100 / 20
        expect(quantized[2]).toBe(2);  // 100 / 50
        expect(quantized[3]).toBe(100); // 100 / 1
    });

    it('handles large values without overflow (JS numbers are doubles)', () => {
        const block = new Float32Array(64).fill(10000);
        const table = new Uint8Array(64).fill(1);
        const quantized = quantize(block, table);
        expect(quantized[0]).toBe(10000);
    });

    it('should roughly roundtrip with dequantize', async () => {
        const { dequantize } = await import('../../src/core/decoder/dequantization.js');

        const original = new Float32Array(64).fill(100);
        const table = new Int32Array(64).fill(10); // Use Int32Array for table to match dequantize signature if needed

        // Quantize: 100 / 10 = 10
        const quantized = quantize(original, table);

        // Dequantize: 10 * 10 = 100
        const reconstructed = dequantize(quantized, table);

        for (let i = 0; i < 64; i++) {
            expect(reconstructed[i]).toBeCloseTo(original[i], 1);
        }
    });

    it('should roundtrip with loss (quantization noise)', async () => {
        const { dequantize } = await import('../../src/core/decoder/dequantization.js');

        const original = new Float32Array(64).fill(105); // 105 / 10 = 10.5 -> 11
        const table = new Int32Array(64).fill(10);

        const quantized = quantize(original, table); // 11
        const reconstructed = dequantize(quantized, table); // 11 * 10 = 110

        // Error should be within half step size (5)
        for (let i = 0; i < 64; i++) {
            expect(Math.abs(reconstructed[i] - original[i])).toBeLessThanOrEqual(5);
        }
    });
});
