import { describe, it, expect } from '../../utils/test-runner.js';
import { zigZag, ZIGZAG_ORDER } from '../../../src/algebraic/mappings/forward-zigzag.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('ZigZag Reordering', () => {
    it('reorders a block correctly (sequential input)', () => {
        const block = new Int32Array(64);
        for (let i = 0; i < 64; i++) block[i] = i;

        const [zigzagged, err] = zigZag(block);
        expect(err).toEqual(null);

        // First few zigzag positions: (0,0)=0, (0,1)=1, (1,0)=8, (2,0)=16
        expect(zigzagged[0]).toBe(0);
        expect(zigzagged[1]).toBe(1);
        expect(zigzagged[2]).toBe(8);
        expect(zigzagged[3]).toBe(16);
    });

    it('should roundtrip with inverseZigZag (exact equality)', async () => {
        const { inverseZigZag } = await import('../../../src/algebraic/mappings/inverse-zigzag.js');

        const original = new Int32Array(64);
        for (let i = 0; i < 64; i++) original[i] = i;

        const [zigzagged, err1] = zigZag(original);
        expect(err1).toEqual(null);
        const [reconstructed, err2] = inverseZigZag(zigzagged);
        expect(err2).toEqual(null);

        for (let i = 0; i < 64; i++) {
            expect(reconstructed[i]).toBe(original[i]);
        }
    });

    it('Property: zigzag/inverseZigzag roundtrip for random blocks', async () => {
        const { inverseZigZag } = await import('../../../src/algebraic/mappings/inverse-zigzag.js');

        await assertProperty(
            [Arbitrary.integer(-1000, 1000)],
            (seed) => {
                const block = new Int32Array(64);
                for (let i = 0; i < 64; i++) block[i] = seed + i * 7;

                const [zigzagged, e1] = zigZag(block);
                if (e1) return false;
                const [reconstructed, e2] = inverseZigZag(zigzagged);
                if (e2) return false;

                for (let i = 0; i < 64; i++) {
                    if (reconstructed[i] !== block[i]) return false;
                }
                return true;
            },
            50
        );
    });

    it('ZIGZAG_ORDER is a valid permutation (bijection over 0-63)', () => {
        expect(ZIGZAG_ORDER.length).toBe(64);
        const seen = new Set();
        for (let i = 0; i < 64; i++) {
            const val = ZIGZAG_ORDER[i];
            expect(val >= 0 && val < 64).toBe(true);
            expect(seen.has(val)).toBe(false);
            seen.add(val);
        }
        expect(seen.size).toBe(64);
    });

    it('should handle all-zero blocks', () => {
        const block = new Int32Array(64).fill(0);
        const [zigzagged, err] = zigZag(block);
        expect(err).toEqual(null);
        for (let i = 0; i < 64; i++) {
            expect(zigzagged[i]).toBe(0);
        }
    });

    it('should return error on invalid array length', () => {
        const invalid = new Int32Array(32);
        const [result, err] = zigZag(invalid);
        expect(result).toEqual(null);
        expect(err).toBeDefined();
        expect(err.message).toBe('Invalid block length: 32 (expected 64)');
    });

    it('should handle Float32Array input', () => {
        const block = new Float32Array(64);
        block[0] = 123.5;
        block[1] = -45.7;

        const [zigzagged, err] = zigZag(block);
        expect(err).toEqual(null);
        expect(zigzagged[0]).toBeCloseTo(123.5, 1);

        // zigzagged[1] maps to block[ZIGZAG_ORDER[1]] = block[1]
        expect(zigzagged[1]).toBeCloseTo(-45.7, 1);
    });

    it('should preserve negative coefficients', () => {
        const block = new Int32Array(64);
        for (let i = 0; i < 64; i++) block[i] = -i * 3;

        const [zigzagged, err] = zigZag(block);
        expect(err).toEqual(null);

        // DC coefficient is always position 0→0
        expect(zigzagged[0]).toBe(0);
        // Every mapped value should match the original at ZIGZAG_ORDER[i]
        for (let i = 0; i < 64; i++) {
            expect(zigzagged[i]).toBe(block[ZIGZAG_ORDER[i]]);
        }
    });
});
