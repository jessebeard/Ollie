import { describe, it, expect } from '../../utils/test-runner.js';
import { idctPureRef, idctOptimizedRef } from '../../../src/algebraic/discrete-cosine/inverse-dct-spec.js';

describe('IDCT Spec Implementations', () => {
    it('should handle DC-only block (constant value)', async () => {

        const coeffs = new Float32Array(64);
        coeffs[0] = 100 * 8;

        const [result, resultErr] = idctPureRef(coeffs);

        for (let i = 0; i < 64; i++) {
            const expected = 100;
            const diff = Math.abs(result[i] - expected);
            if (diff >= 1.0) {
                console.log(`Pixel ${i}: expected ${expected}, got ${result[i]}, diff ${diff}`);
            }
            expect(diff < 1.0).toBe(true);
        }
    });

    it('should match optimized and pure ref for DC-only', async () => {
        const coeffs = new Float32Array(64);
        coeffs[0] = 64 * 100;

        const [pure, pureErr] = idctPureRef(coeffs);
        const [opt, optErr] = idctOptimizedRef(coeffs);

        for (let i = 0; i < 64; i++) {
            const diff = Math.abs(pure[i] - opt[i]);
            expect(diff < 0.01).toBe(true);
        }
    });

    it('should validate coefficient block length', async () => {
        const [, err] = idctPureRef(new Float32Array(32));
        expect(err).toBeDefined();
        expect(err.message).toBeDefined();
    });
});
