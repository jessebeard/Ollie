import { describe, it, expect } from '../../utils/test-runner.js';
import { idctPureRef, idctOptimizedRef } from '../../../src/core/decoder/idct-spec.js';

describe('IDCT Spec Implementations', () => {
    it('should handle DC-only block (constant value)', () => {
        // For a constant block of value V, the DC coefficient is V * 8 (not 64)
        // This is because the forward DCT has a normalization factor
        // Testing with value 100
        const coeffs = new Float32Array(64);
        coeffs[0] = 100 * 8;  // DC component

        const result = idctPureRef(coeffs);

        // All pixels should be approximately 100
        for (let i = 0; i < 64; i++) {
            const expected = 100;
            const diff = Math.abs(result[i] - expected);
            if (diff >= 1.0) {
                console.log(`Pixel ${i}: expected ${expected}, got ${result[i]}, diff ${diff}`);
            }
            expect(diff < 1.0).toBe(true);  // Within 1.0 tolerance
        }
    });

    it('should match optimized and pure ref for DC-only', () => {
        const coeffs = new Float32Array(64);
        coeffs[0] = 64 * 100;

        const pure = idctPureRef(coeffs);
        const opt = idctOptimizedRef(coeffs);

        // Results should match within tolerance
        for (let i = 0; i < 64; i++) {
            const diff = Math.abs(pure[i] - opt[i]);
            expect(diff < 0.01).toBe(true);
        }
    });

    it('should validate coefficient block length', () => {
        let threw = false;
        try {
            idctPureRef(new Float32Array(32));
        } catch (e) {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
