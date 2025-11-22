import { describe, it, expect } from '../../utils/test-runner.js';
import { dequantize } from '../../../src/core/decoder/dequantization.js';

describe('Dequantization', () => {
    it('should multiply coefficients by quantization table values', () => {
        const quantized = new Int32Array([10, 5, 3, 0, 0, 0, 0, 0]);
        // Pad to 64 elements
        const quantizedBlock = new Int32Array(64);
        quantizedBlock.set(quantized);

        const quantTable = new Int32Array(64);
        quantTable[0] = 16;
        quantTable[1] = 11;
        quantTable[2] = 10;

        const result = dequantize(quantizedBlock, quantTable);

        expect(result[0]).toBe(160);  // 10 * 16
        expect(result[1]).toBe(55);   // 5 * 11
        expect(result[2]).toBe(30);   // 3 * 10
        expect(result[3]).toBe(0);
    });

    it('should handle all-zero blocks', () => {
        const quantized = new Int32Array(64);
        const quantTable = new Int32Array(64);
        quantTable.fill(16);

        const result = dequantize(quantized, quantTable);

        for (let i = 0; i < 64; i++) {
            expect(result[i]).toBe(0);
        }
    });

    it('should handle DC-only blocks', () => {
        const quantized = new Int32Array(64);
        quantized[0] = 100;

        const quantTable = new Int32Array(64);
        quantTable[0] = 8;

        const result = dequantize(quantized, quantTable);

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

        const result = dequantize(quantized, quantTable);

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

        const result = dequantize(quantized, quantTable);

        expect(result[0]).toBe(168);  // 10.5 * 16
        expect(result[1]).toBe(55);   // 5.5 * 10
    });

    it('should validate block length', () => {
        const invalid = new Int32Array(32);
        const quantTable = new Int32Array(64);

        let errorThrown = false;
        try {
            dequantize(invalid, quantTable);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid block length: 32 (expected 64)');
        }
        expect(errorThrown).toBe(true);
    });

    it('should validate quantization table length', () => {
        const quantized = new Int32Array(64);
        const invalid = new Int32Array(32);

        let errorThrown = false;
        try {
            dequantize(quantized, invalid);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid quantization table length: 32 (expected 64)');
        }
        expect(errorThrown).toBe(true);
    });

    it('should handle typical JPEG quantization table', () => {
        // Typical luminance quantization table (quality 50)
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
        quantized[0] = 50;  // DC coefficient
        quantized[1] = 10;
        quantized[2] = 5;

        const result = dequantize(quantized, quantTable);

        expect(result[0]).toBe(800);   // 50 * 16
        expect(result[1]).toBe(110);   // 10 * 11
        expect(result[2]).toBe(50);    // 5 * 10
    });

    it('should process all 64 coefficients', () => {
        const quantized = new Int32Array(64);
        const quantTable = new Int32Array(64);

        for (let i = 0; i < 64; i++) {
            quantized[i] = i + 1;
            quantTable[i] = 2;
        }

        const result = dequantize(quantized, quantTable);

        for (let i = 0; i < 64; i++) {
            expect(result[i]).toBe((i + 1) * 2);
        }
    });
});
