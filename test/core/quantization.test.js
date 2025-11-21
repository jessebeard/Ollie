import { describe, it, expect } from '/test/utils/test-runner.js';
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

    it('handles negative values', () => {
        const block = new Float32Array(64).fill(-100);
        // -100 / 16 = -6.25 -> round to -6
        const quantized = quantize(block, QUANTIZATION_TABLE_LUMA);
        expect(quantized[0]).toBe(-6);
    });
});
