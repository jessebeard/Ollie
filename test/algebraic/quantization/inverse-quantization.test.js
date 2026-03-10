import { describe, it, expect } from '../../utils/test-runner.js';
import { dequantize } from '../../../src/algebraic/quantization/inverse-quantization.js';

describe('Dequantization', () => {
    it('should multiply coefficients by quantization table values', () => {
        const quantized = new Int32Array([10, 5, 3, 0, 0, 0, 0, 0]);

        const quantizedBlock = new Int32Array(64);
        quantizedBlock.set(quantized);

        const quantTable = new Int32Array(64);
        quantTable[0] = 16;
        quantTable[1] = 11;
        quantTable[2] = 10;

        const [result, err] = dequantize(quantizedBlock, quantTable);
        expect(err).toEqual(null);

        expect(result[0]).toBe(160);
        expect(result[1]).toBe(55);
        expect(result[2]).toBe(30);
        expect(result[3]).toBe(0);
    });

    it('should handle all-zero blocks', () => {
        const quantized = new Int32Array(64);
        const quantTable = new Int32Array(64);
        quantTable.fill(16);

        const [result, err] = dequantize(quantized, quantTable);
        expect(err).toEqual(null);

        for (let i = 0; i < 64; i++) {
            expect(result[i]).toBe(0);
        }
    });

    it('should handle DC-only blocks', () => {
        const quantized = new Int32Array(64);
        quantized[0] = 100;

        const quantTable = new Int32Array(64);
        quantTable[0] = 8;

        const [result, err] = dequantize(quantized, quantTable);
        expect(err).toEqual(null);

        expect(result[0]).toBe(800);
        expect(result[1]).toBe(0);
    });

    it('should preserve negative coefficients', () => {
        const quantized = new Int32Array(64);
        quantized[0] = 50;
        quantized[1] = -10;
        quantized[2] = -5;

        const quantTable = new Int32Array(64);
        quantTable[0] = 16;
        quantTable[1] = 11;
        quantTable[2] = 10;

        const [result, err] = dequantize(quantized, quantTable);
        expect(err).toEqual(null);

        expect(result[0]).toBe(800);
        expect(result[1]).toBe(-110);
        expect(result[2]).toBe(-50);
    });

    it('should work with Float32Array input', () => {
        const quantized = new Float32Array(64);
        quantized[0] = 10.5;
        quantized[1] = 5.5;

        const quantTable = new Int32Array(64);
        quantTable[0] = 16;
        quantTable[1] = 10;

        const [result, err] = dequantize(quantized, quantTable);
        expect(err).toEqual(null);

        expect(result[0]).toBe(168);
        expect(result[1]).toBe(55);
    });

    it('should return error on invalid block length', () => {
        const invalid = new Int32Array(32);
        const quantTable = new Int32Array(64);

        const [result, err] = dequantize(invalid, quantTable);
        expect(result).toEqual(null);
        expect(err).toBeDefined();
        expect(err.message).toBe('Invalid block length: 32 (expected 64)');
    });

    it('should return error on invalid quantization table length', () => {
        const quantized = new Int32Array(64);
        const invalid = new Int32Array(32);

        const [result, err] = dequantize(quantized, invalid);
        expect(result).toEqual(null);
        expect(err).toBeDefined();
        expect(err.message).toBe('Invalid quantization table length: 32 (expected 64)');
    });

    it('should handle typical JPEG quantization table', () => {
        const quantTable = new Int32Array([
            16, 11, 10, 16, 24, 40, 51, 61,
            12, 12, 14, 19, 26, 58, 60, 55,
            14, 13, 16, 24, 40, 57, 69, 56,
            14, 17, 22, 29, 51, 87, 80, 62,
            18, 22, 37, 56, 68, 109, 103, 77,
            24, 35, 55, 64, 81, 104, 113, 92,
            49, 64, 78, 87, 103, 121, 120, 101,
            72, 92, 95, 98, 112, 100, 103, 99
        ]);

        const quantized = new Int32Array(64);
        quantized[0] = 50;
        quantized[1] = 10;
        quantized[2] = 5;

        const [result, err] = dequantize(quantized, quantTable);
        expect(err).toEqual(null);

        expect(result[0]).toBe(800);
        expect(result[1]).toBe(110);
        expect(result[2]).toBe(50);
    });

    it('should process all 64 coefficients', () => {
        const quantized = new Int32Array(64);
        const quantTable = new Int32Array(64);

        for (let i = 0; i < 64; i++) {
            quantized[i] = i + 1;
            quantTable[i] = 2;
        }

        const [result, err] = dequantize(quantized, quantTable);
        expect(err).toEqual(null);

        for (let i = 0; i < 64; i++) {
            expect(result[i]).toBe((i + 1) * 2);
        }
    });
});
