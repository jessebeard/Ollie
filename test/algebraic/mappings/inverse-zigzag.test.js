import { describe, it, expect } from '../../utils/test-runner.js';
import { inverseZigZag, ZIGZAG_ORDER } from '../../../src/algebraic/mappings/inverse-zigzag.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('InverseZigZag', () => {
    it('should convert 64-element array to 8×8 block', () => {
        const zigzag = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
            zigzag[i] = i;
        }

        const [block, err] = inverseZigZag(zigzag);
        expect(err).toEqual(null);
        expect(block.length).toBe(64);
        expect(block[0]).toBe(0);
    });

    it('should use correct inverse zigzag order', () => {
        const zigzag = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
            zigzag[i] = i;
        }

        const [block, err] = inverseZigZag(zigzag);
        expect(err).toEqual(null);
        expect(block[0]).toBe(0);
        expect(block[1]).toBe(1);
        expect(block[8]).toBe(2);
    });

    it('should match encoder zigzag pattern', () => {
        expect(ZIGZAG_ORDER[0]).toBe(0);
        expect(ZIGZAG_ORDER[1]).toBe(1);
        expect(ZIGZAG_ORDER[2]).toBe(8);
        expect(ZIGZAG_ORDER[3]).toBe(16);
        expect(ZIGZAG_ORDER[4]).toBe(9);
        expect(ZIGZAG_ORDER[5]).toBe(2);
    });

    it('should handle all-zero blocks', () => {
        const zigzag = new Int32Array(64);
        const [block, err] = inverseZigZag(zigzag);
        expect(err).toEqual(null);

        for (let i = 0; i < 64; i++) {
            expect(block[i]).toBe(0);
        }
    });

    it('should preserve coefficient values', () => {
        const zigzag = new Int32Array(64);
        zigzag[0] = 100;
        zigzag[1] = 50;
        zigzag[2] = -30;
        zigzag[63] = 5;

        const [block, err] = inverseZigZag(zigzag);
        expect(err).toEqual(null);
        expect(block[ZIGZAG_ORDER[0]]).toBe(100);
        expect(block[ZIGZAG_ORDER[1]]).toBe(50);
        expect(block[ZIGZAG_ORDER[2]]).toBe(-30);
        expect(block[ZIGZAG_ORDER[63]]).toBe(5);
    });

    it('should return error on invalid array length', () => {
        const invalid = new Int32Array(32);
        const [result, err] = inverseZigZag(invalid);
        expect(result).toEqual(null);
        expect(err).toBeDefined();
        expect(err.message).toBe('Invalid zigzag array length: 32 (expected 64)');
    });

    it('should handle Float32Array input', () => {
        const zigzag = new Float32Array(64);
        zigzag[0] = 123.5;
        zigzag[10] = -45.7;

        const [block, err] = inverseZigZag(zigzag);
        expect(err).toEqual(null);
        expect(block[ZIGZAG_ORDER[0]]).toBe(123.5);

        const val = block[ZIGZAG_ORDER[10]];
        expect(Math.abs(val - (-45.7)) < 0.001).toBe(true);
    });

    it('should verify complete zigzag pattern', () => {
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

    it('Property: inverseZigZag is a bijection (all 64 positions mapped)', async () => {
        await assertProperty(
            [Arbitrary.integer(-1000, 1000)],
            (dcCoeff) => {
                const zigzag = new Int32Array(64);
                zigzag[0] = dcCoeff;
                const [block, err] = inverseZigZag(zigzag);
                if (err) return false;
                return block[ZIGZAG_ORDER[0]] === dcCoeff;
            },
            50
        );
    });

    it('should correctly reorder specific test pattern', () => {
        const zigzag = new Int32Array(64);
        zigzag[0] = 10;
        zigzag[1] = 11;
        zigzag[2] = 12;
        zigzag[3] = 13;

        const [block, err] = inverseZigZag(zigzag);
        expect(err).toEqual(null);
        expect(block[0]).toBe(10);
        expect(block[1]).toBe(11);
        expect(block[8]).toBe(12);
        expect(block[16]).toBe(13);
    });

    it('should handle negative coefficients', () => {
        const zigzag = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
            zigzag[i] = -i;
        }

        const [block, err] = inverseZigZag(zigzag);
        expect(err).toEqual(null);
        expect(block[0]).toBe(0);
        expect(block[1]).toBe(-1);
        expect(block[ZIGZAG_ORDER[63]]).toBe(-63);
    });
});
