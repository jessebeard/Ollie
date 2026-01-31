import { describe, it, expect } from '../../utils/test-runner.js';
import { quantize, QUANTIZATION_TABLE_LUMA, QUANTIZATION_TABLE_CHROMA } from '../../../src/core/encoder/quantization.js';

describe('Quantization', () => {
    it('quantizes a block correctly', () => {
        
        const block = new Float32Array(64).fill(100);

        const quantized = quantize(block, QUANTIZATION_TABLE_LUMA);
        expect(quantized[0]).toBe(6);

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

        expect(quantized[0]).toBe(10);
    });

    it('handles rounding correctly', () => {
        const block = new Float32Array(64);
        block[0] = 14; 
        block[1] = 16; 
        block[2] = -14; 
        block[3] = -16; 

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

        expect(quantized[0]).toBe(10); 
        expect(quantized[1]).toBe(5);  
        expect(quantized[2]).toBe(2);  
        expect(quantized[3]).toBe(100); 
    });

    it('handles large values without overflow (JS numbers are doubles)', () => {
        const block = new Float32Array(64).fill(10000);
        const table = new Uint8Array(64).fill(1);
        const quantized = quantize(block, table);
        expect(quantized[0]).toBe(10000);
    });

    it('should roughly roundtrip with dequantize', async () => {
        const { dequantize } = await import('../../../src/core/decoder/dequantization.js');

        const original = new Float32Array(64).fill(100);
        const table = new Int32Array(64).fill(10); 

        const quantized = quantize(original, table);

        const reconstructed = dequantize(quantized, table);

        for (let i = 0; i < 64; i++) {
            expect(reconstructed[i]).toBeCloseTo(original[i], 1);
        }
    });

    it('should roundtrip with loss (quantization noise)', async () => {
        const { dequantize } = await import('../../../src/core/decoder/dequantization.js');

        const original = new Float32Array(64).fill(105); 
        const table = new Int32Array(64).fill(10);

        const quantized = quantize(original, table); 
        const reconstructed = dequantize(quantized, table); 

        for (let i = 0; i < 64; i++) {
            expect(Math.abs(reconstructed[i] - original[i])).toBeLessThanOrEqual(5);
        }
    });
});
