import { describe, it, expect } from '../../utils/test-runner.js';
import { KeyDerivation } from '../../../src/information-theory/cryptography/pbkdf2.js';

describe('KeyDerivation: Hardware Benchmark & Strict Iteration Floor', () => {

    it('enforces strict 600,000 iteration floor in resolveIterations', () => {
        expect(KeyDerivation.resolveIterations(600000)).toBe(600000);
        expect(KeyDerivation.resolveIterations(1000000)).toBe(1000000);
        expect(KeyDerivation.resolveIterations(10000000)).toBe(10000000);
        expect(KeyDerivation.resolveIterations()).toBe(KeyDerivation.ITERATIONS);

        // Sub-600k values must return Error
        const err1 = KeyDerivation.resolveIterations(599999);
        expect(err1).toBeInstanceOf(Error);
        expect(err1.message).toMatch(/600,?000/);

        const err2 = KeyDerivation.resolveIterations(100000);
        expect(err2).toBeInstanceOf(Error);

        const err3 = KeyDerivation.resolveIterations(0);
        expect(err3).toBeInstanceOf(Error);

        const err4 = KeyDerivation.resolveIterations(-500);
        expect(err4).toBeInstanceOf(Error);

        const err5 = KeyDerivation.resolveIterations(10000001);
        expect(err5).toBeInstanceOf(Error);

        const err6 = KeyDerivation.resolveIterations(1.5);
        expect(err6).toBeInstanceOf(Error);
    });

    it('executes hardware benchmark and returns recommendation bounded [600k, 10M]', async () => {
        const [result, err] = await KeyDerivation.benchmark({ sampleIterations: 20000, targetMs: 300 });
        expect(err).toBe(null);
        expect(result).not.toBe(null);
        expect(result.sampleElapsedMs).toBeGreaterThanOrEqual(0);
        expect(result.sampleIterations).toBe(20000);
        expect(result.recommendedIterations).toBeGreaterThanOrEqual(600000);
        expect(result.recommendedIterations).toBeLessThanOrEqual(10000000);
        expect(result.estimatedUnlockMs).toBeGreaterThanOrEqual(0);
    });

    it('Metamorphic MR1: Derivation duration scales monotonically with iteration count', async () => {
        const salt = new Uint8Array(16).fill(0x12);
        const pass = 'mr1-scaling-test';

        const t0 = performance.now();
        const [, e1] = await KeyDerivation.deriveKey(pass, salt, { iterations: 600000 });
        const d1 = performance.now() - t0;
        expect(e1).toBe(null);

        const t1 = performance.now();
        const [, e2] = await KeyDerivation.deriveKey(pass, salt, { iterations: 1200000 });
        const d2 = performance.now() - t1;
        expect(e2).toBe(null);

        // 1.2M iterations should take strictly longer than 600k iterations (with a small timing noise buffer)
        expect(d2).toBeGreaterThanOrEqual(d1 * 0.9);
    });

    it('Metamorphic MR2: Benchmark recommendation scales with target duration', async () => {
        const [bShort] = await KeyDerivation.benchmark({ sampleIterations: 20000, targetMs: 200 });
        const [bLong] = await KeyDerivation.benchmark({ sampleIterations: 20000, targetMs: 600 });

        expect(bShort).not.toBe(null);
        expect(bLong).not.toBe(null);
        expect(bLong.recommendedIterations).toBeGreaterThanOrEqual(bShort.recommendedIterations);
    });
});
