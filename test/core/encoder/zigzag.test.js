import { describe, it, expect } from '../../utils/test-runner.js';
import { zigZag, ZIGZAG_ORDER } from '../../../src/core/encoder/zigzag.js';

describe('ZigZag Reordering', () => {
    it('reorders a block correctly', () => {
        // Create a block with indices as values
        const block = new Int32Array(64);
        for (let i = 0; i < 64; i++) block[i] = i;

        const zigzagged = zigZag(block);

        // Check specific known positions
        // (0,0) -> 0
        expect(zigzagged[0]).toBe(0);
        // (0,1) -> 1
        expect(zigzagged[1]).toBe(1);
        // (1,0) -> 2
        expect(zigzagged[2]).toBe(8);
        // (2,0) -> 3
        expect(zigzagged[3]).toBe(16);
    });

    it('should roundtrip with inverseZigZag', async () => {
        const { inverseZigZag } = await import('../../../src/core/decoder/inverse-zigzag.js');

        const original = new Int32Array(64);
        for (let i = 0; i < 64; i++) original[i] = i;

        const zigzagged = zigZag(original);
        const reconstructed = inverseZigZag(zigzagged);

        for (let i = 0; i < 64; i++) {
            expect(reconstructed[i]).toBe(original[i]);
        }
    });

    it('should roundtrip random data', async () => {
        const { inverseZigZag } = await import('../../../src/core/decoder/inverse-zigzag.js');

        const original = new Int32Array(64);
        for (let i = 0; i < 64; i++) original[i] = Math.floor(Math.random() * 1000) - 500;

        const zigzagged = zigZag(original);
        const reconstructed = inverseZigZag(zigzagged);

        for (let i = 0; i < 64; i++) {
            expect(reconstructed[i]).toBe(original[i]);
        }
    });

    it('should handle all-zero blocks efficiently', () => {
        const block = new Int32Array(64).fill(0);
        const zigzagged = zigZag(block);
        for (let i = 0; i < 64; i++) {
            expect(zigzagged[i]).toBe(0);
        }
    });

    it('should throw error on invalid array length', () => {
        const invalid = new Int32Array(32);
        let errorThrown = false;
        try {
            zigZag(invalid);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBeDefined();
        }
        expect(errorThrown).toBe(true);
    });

    it('should handle Float32Array input', () => {
        const block = new Float32Array(64);
        block[0] = 123.5;
        block[1] = -45.7; // (0,1) -> index 1 in zigzag

        const zigzagged = zigZag(block);

        expect(zigzagged[0]).toBeCloseTo(123.5, 1);
        expect(zigzagged[1]).toBeCloseTo(-45.7, 1);
    });
});
