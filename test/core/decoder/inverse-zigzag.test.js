import { describe, it, expect } from '../../utils/test-runner.js';
import { inverseZigZag, ZIGZAG_ORDER } from '../../../src/core/decoder/inverse-zigzag.js';

describe('InverseZigZag', () => {
    it('should convert 64-element array to 8x8 block', () => {
        const zigzag = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
            zigzag[i] = i;
        }

        const block = inverseZigZag(zigzag);

        expect(block.length).toBe(64);
        expect(block[0]).toBe(0); // DC coefficient stays at position 0
    });

    it('should use correct inverse zigzag order', () => {
        // Create array where each element equals its index
        const zigzag = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
            zigzag[i] = i;
        }

        const block = inverseZigZag(zigzag);

        // Verify specific positions match the zigzag pattern
        // zigzag[0] -> block[0], zigzag[1] -> block[1], zigzag[2] -> block[8]
        expect(block[0]).toBe(0);   // zigzag[0] goes to position 0
        expect(block[1]).toBe(1);   // zigzag[1] goes to position 1
        expect(block[8]).toBe(2);   // zigzag[2] goes to position 8
    });

    it('should match encoder zigzag pattern', () => {
        // Verify the zigzag order matches the encoder
        expect(ZIGZAG_ORDER[0]).toBe(0);
        expect(ZIGZAG_ORDER[1]).toBe(1);
        expect(ZIGZAG_ORDER[2]).toBe(8);
        expect(ZIGZAG_ORDER[3]).toBe(16);
        expect(ZIGZAG_ORDER[4]).toBe(9);
        expect(ZIGZAG_ORDER[5]).toBe(2);
    });

    it('should handle all-zero blocks efficiently', () => {
        const zigzag = new Int32Array(64); // All zeros
        const block = inverseZigZag(zigzag);

        for (let i = 0; i < 64; i++) {
            expect(block[i]).toBe(0);
        }
    });

    it('should preserve coefficient values', () => {
        const zigzag = new Int32Array(64);
        zigzag[0] = 100;  // DC
        zigzag[1] = 50;   // First AC
        zigzag[2] = -30;  // Second AC
        zigzag[63] = 5;   // Last AC

        const block = inverseZigZag(zigzag);

        // Values should be preserved, just reordered
        expect(block[ZIGZAG_ORDER[0]]).toBe(100);
        expect(block[ZIGZAG_ORDER[1]]).toBe(50);
        expect(block[ZIGZAG_ORDER[2]]).toBe(-30);
        expect(block[ZIGZAG_ORDER[63]]).toBe(5);
    });

    it('should throw error on invalid array length', () => {
        const invalid = new Int32Array(32); // Wrong length

        let errorThrown = false;
        try {
            inverseZigZag(invalid);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid zigzag array length: 32 (expected 64)');
        }
        expect(errorThrown).toBe(true);
    });

    it('should handle Float32Array input', () => {
        const zigzag = new Float32Array(64);
        zigzag[0] = 123.5;
        zigzag[10] = -45.7;

        const block = inverseZigZag(zigzag);

        expect(block[ZIGZAG_ORDER[0]]).toBe(123.5);
        // Use approximate comparison for floating point
        const val = block[ZIGZAG_ORDER[10]];
        expect(Math.abs(val - (-45.7)) < 0.001).toBe(true);
    });

    it('should verify complete zigzag pattern', () => {
        // Verify all 64 positions are unique and in range [0, 63]
        const seen = new Set();

        for (let i = 0; i < 64; i++) {
            const pos = ZIGZAG_ORDER[i];
            expect(pos).toBeGreaterThan(-1);
            expect(pos).toBeLessThan(64);
            expect(seen.has(pos)).toBe(false);
            seen.add(pos);
        }

        expect(seen.size).toBe(64);
    });

    it('should correctly reorder specific test pattern', () => {
        // Create a specific pattern to verify reordering
        const zigzag = new Int32Array(64);
        zigzag[0] = 10;  // DC -> position 0
        zigzag[1] = 11;  // -> position 1
        zigzag[2] = 12;  // -> position 8
        zigzag[3] = 13;  // -> position 16

        const block = inverseZigZag(zigzag);

        // These should map to positions according to zigzag order
        expect(block[0]).toBe(10);   // zigzag[0] -> position 0
        expect(block[1]).toBe(11);   // zigzag[1] -> position 1
        expect(block[8]).toBe(12);   // zigzag[2] -> position 8
        expect(block[16]).toBe(13);  // zigzag[3] -> position 16
    });

    it('should handle negative coefficients', () => {
        const zigzag = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
            zigzag[i] = -i;
        }

        const block = inverseZigZag(zigzag);

        expect(block[0]).toBe(0);
        expect(block[1]).toBe(-1);
        expect(block[ZIGZAG_ORDER[63]]).toBe(-63);
    });
});
