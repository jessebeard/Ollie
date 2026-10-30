import { describe, it, expect } from '../../utils/test-runner.js';
import { createCycleWalkingFeistel } from '../../../src/information-theory/cryptography/feistel-permutation.js';

describe('Keyed Cycle-Walking Feistel Permutation', () => {

    // =========================================================================
    // 1. BIJECTIVITY: NO DUPLICATES, FULL DOMAIN COVERAGE
    // =========================================================================
    it('guarantees complete bijectivity: every single index in [0, N-1] is hit exactly once', () => {
        const testDomains = [1, 2, 3, 7, 16, 63, 97, 100, 256, 500, 1009, 2048];

        for (const N of testDomains) {
            const { permute } = createCycleWalkingFeistel(N, `bijectivity-seed-${N}`);
            const hitCount = new Uint8Array(N);

            for (let t = 0; t < N; t++) {
                const out = permute(t);
                expect(out >= 0 && out < N).toBe(true);
                expect(hitCount[out]).toBe(0); // Zero collisions invariant
                hitCount[out] = 1;
            }

            // Full domain coverage invariant: not a single element dropped
            for (let i = 0; i < N; i++) {
                expect(hitCount[i]).toBe(1);
            }
        }
    });

    // =========================================================================
    // 2. INVERSE PERMUTATION: REVERSIBILITY
    // =========================================================================
    it('is strictly reversible: unpermute(permute(x)) === x and permute(unpermute(x)) === x across 100% of domain', () => {
        const testDomains = [5, 63, 128, 500, 1024];

        for (const N of testDomains) {
            const { permute, unpermute } = createCycleWalkingFeistel(N, `reversibility-seed-${N}`);

            for (let x = 0; x < N; x++) {
                const forward = permute(x);
                expect(forward >= 0 && forward < N).toBe(true);

                const recovered = unpermute(forward);
                expect(recovered).toBe(x);

                const backward = unpermute(x);
                expect(backward >= 0 && backward < N).toBe(true);
                expect(permute(backward)).toBe(x);
            }
        }
    });

    // =========================================================================
    // 3. STRICT CYCLE-WALKING BOUNDARY SAFETY (WORST-CASE DOMAINS)
    // =========================================================================
    it('strictly bounds cycle-walking on maximum-rejection edge cases (N = 2^(2k-2) + 1)', () => {
        const worstCaseDomains = [5, 17, 65, 257, 1025, 4097];

        for (const N of worstCaseDomains) {
            const { permute, unpermute } = createCycleWalkingFeistel(N, `worst-case-boundary-${N}`);
            const seen = new Uint8Array(N);

            for (let t = 0; t < N; t++) {
                const out = permute(t);
                expect(out >= 0 && out < N).toBe(true);
                expect(seen[out]).toBe(0);
                seen[out] = 1;

                expect(unpermute(out)).toBe(t);
            }

            for (let i = 0; i < N; i++) {
                expect(seen[i]).toBe(1);
            }
        }
    });

    // =========================================================================
    // 4. STATISTICALLY RIGOROUS QUANTIZED STEP DELTA ENTROPY
    // =========================================================================
    it('produces high quantized Shannon entropy for step deltas (defeats monotonic stride)', () => {
        const N = 100000;
        const sampleCount = 5000;
        const numDeltaBins = 20; // 20 discrete quantiles
        const binCounts = new Array(numDeltaBins).fill(0);
        const { permute } = createCycleWalkingFeistel(N, 'entropy-step-seed');

        let backwardJumps = 0;
        let prev = permute(0);

        for (let t = 1; t < sampleCount; t++) {
            const curr = permute(t);
            if (curr < prev) backwardJumps++;

            const delta = (curr - prev + N) % N;
            const b = Math.floor((delta * numDeltaBins) / N);
            binCounts[b]++;
            prev = curr;
        }

        // Backward jump ratio should alternate naturally (~50%, bound 40%..60%)
        const backwardRatio = backwardJumps / (sampleCount - 1);
        expect(backwardRatio > 0.40).toBe(true);
        expect(backwardRatio < 0.60).toBe(true);

        // Quantized Shannon Entropy: H = -sum(p * log2(p))
        // Max possible entropy for 20 bins is log2(20) ~ 4.32 bits.
        // A monotonic stride concentrates in 1 bin (H <= 1.0).
        // A pseudorandom permutation spreads across bins with H > 4.0 bits.
        let entropy = 0;
        const totalSteps = sampleCount - 1;
        for (const count of binCounts) {
            if (count > 0) {
                const p = count / totalSteps;
                entropy -= p * Math.log2(p);
            }
        }
        expect(entropy > 4.0).toBe(true);
    });

    // =========================================================================
    // 5. PEARSON CHI-SQUARE TESTS: SPATIAL & DCT FREQUENCY UNIFORMITY
    // =========================================================================
    it('passes Pearson chi-square tests for spatial and DCT block frequency uniformity', () => {
        const N = 100000;
        const sampleCount = 10000;
        const numBins = 10;
        const expectedPerBin = sampleCount / numBins; // 1000
        const binCounts = new Array(numBins).fill(0);

        const { permute } = createCycleWalkingFeistel(N, 'pearson-chi-square-seed');
        for (let t = 0; t < sampleCount; t++) {
            const val = permute(t);
            const bin = Math.floor((val * numBins) / N);
            binCounts[bin]++;
        }

        // Spatial Chi-Square across 10 deciles (df = 9, alpha = 0.01 threshold = 21.67)
        let spatialChi2 = 0;
        for (let b = 0; b < numBins; b++) {
            const diff = binCounts[b] - expectedPerBin;
            spatialChi2 += (diff * diff) / expectedPerBin;
        }
        expect(spatialChi2 < 21.67).toBe(true);

        // DCT Frequency Subband Uniformity across all 63 AC frequency positions (0..62)
        const acSamples = 63000;
        const expectedPerAC = acSamples / 63; // 1000
        const acCounts = new Array(63).fill(0);

        for (let t = 0; t < acSamples; t++) {
            const val = permute(t);
            acCounts[val % 63]++;
        }

        // Chi-Square across 63 AC bins (df = 62, critical value at alpha=0.001 is 102.0)
        let acChi2 = 0;
        for (let c = 0; c < 63; c++) {
            const diff = acCounts[c] - expectedPerAC;
            acChi2 += (diff * diff) / expectedPerAC;
        }
        expect(acChi2 < 100.0).toBe(true);
    });

    // =========================================================================
    // 6. STRICT AVALANCHE CRITERION: FULL KEY-WIDTH SAC (TEST 6b)
    // =========================================================================
    it('satisfies Full Key-Width SAC: flipping byte 31 of a 32-byte key flips ~50% of output bits', () => {
        const N = 1024; // 10-bit output domain
        const keyA = new Uint8Array(32).fill(0x3C);
        const keyB = new Uint8Array(32).fill(0x3C);
        keyB[31] ^= 0x80; // Flip highest bit of the very last key byte

        const fA = createCycleWalkingFeistel(N, keyA);
        const fB = createCycleWalkingFeistel(N, keyB);

        let totalFlippedBits = 0;
        const trials = 500;
        for (let x = 0; x < trials; x++) {
            const outA = fA.permute(x);
            const outB = fB.permute(x);
            const xorDiff = outA ^ outB;

            let diffBits = 0;
            let temp = xorDiff;
            while (temp > 0) {
                diffBits += (temp & 1);
                temp >>>= 1;
            }
            totalFlippedBits += diffBits;
        }

        // 10-bit domain: expected ~5.0 flipped bits per trial (bound 4.0..6.0)
        const avgFlippedBits = totalFlippedBits / trials;
        expect(avgFlippedBits > 4.0).toBe(true);
        expect(avgFlippedBits < 6.0).toBe(true);
    });

    // =========================================================================
        // 6b. INPUT STRICT AVALANCHE CRITERION across BOTH L and R halves
        // =========================================================================
        it('satisfies Input SAC across all 10 bit positions (both L and R half-blocks)', () => {
            const N = 1024; // 2^10: flipping any bit 0..9 stays strictly within [0, 1023]
            const { permute } = createCycleWalkingFeistel(N, 'input-sac-seed-key');

            let leftHalfFlippedBits = 0;  // Bits 5..9 (L half-block)
            let rightHalfFlippedBits = 0; // Bits 0..4 (R half-block)
            const trialsPerBit = 100;

            for (let bit = 0; bit < 10; bit++) {
                const mask = 1 << bit;
                for (let x = 0; x < trialsPerBit; x++) {
                    const outA = permute(x);
                    const outB = permute(x ^ mask);
                    let temp = outA ^ outB;
                    let diffBits = 0;
                    while (temp > 0) {
                        diffBits += (temp & 1);
                        temp >>>= 1;
                    }
                    if (bit < 5) {
                        rightHalfFlippedBits += diffBits;
                    } else {
                        leftHalfFlippedBits += diffBits;
                    }
                }
            }

            const avgRightSAC = rightHalfFlippedBits / (5 * trialsPerBit);
            const avgLeftSAC = leftHalfFlippedBits / (5 * trialsPerBit);

            // Both L and R half-block single-bit perturbations must independently flip ~5.0 bits
            expect(avgRightSAC > 4.0 && avgRightSAC < 6.0).toBe(true);
            expect(avgLeftSAC > 4.0 && avgLeftSAC < 6.0).toBe(true);
        });

    // =========================================================================
    // 7. CARRIER SCALE INVARIANT (15 MEGAPIXELS)
    // =========================================================================
    it('samples 20,000 distinct coordinates collision-free on 15MP image domain (N = 12,776,400)', () => {
        const N = 12776400; // 15 Megapixel JPEG carrier AC coefficients
        const { permute } = createCycleWalkingFeistel(N, 'Doug-Carrier-15MP-Seed');
        const sampleCount = 20000;
        const seen = new Set();

        for (let t = 0; t < sampleCount; t++) {
            const val = permute(t);
            expect(val >= 0 && val < N).toBe(true);
            expect(seen.has(val)).toBe(false);
            seen.add(val);
        }
        expect(seen.size).toBe(sampleCount);
    });

    // =========================================================================
    // 8. DEFENSIVE INPUT HANDLING & DETERMINISM
    // =========================================================================
    it('is deterministic for identical seeds and normalizes string / Uint8Array inputs', () => {
        const N = 100;
        const seedStr = 'deterministic-seed-xyz';
        const seedBytes = new TextEncoder().encode(seedStr);

        const f1 = createCycleWalkingFeistel(N, seedStr);
        const f2 = createCycleWalkingFeistel(N, seedBytes);

        for (let t = 0; t < N; t++) {
            expect(f1.permute(t)).toBe(f2.permute(t));
        }
    });

    // =========================================================================
    // 9. ROUND SUBKEY INDEPENDENCE & NON-INVOLUTION (TEST 9)
    // =========================================================================
    it('ensures distinct round subkeys, non-involution, fixed-point bounds, and non-zero fixed points', () => {
            const N = 500;
            const { permute } = createCycleWalkingFeistel(N, 'non-involution-test-seed');

            // 1 & 2. Separate 1-cycles (fixed points: permute(x) === x)
            //        from proper 2-cycles (involutions: permute(permute(x)) === x && y !== x)
            let fixedPoints = 0;
            let twoCycles = 0;
            for (let x = 0; x < N; x++) {
                const y = permute(x);
                if (y === x) {
                    fixedPoints++;
                } else if (permute(y) === x) {
                    twoCycles++;
                }
            }
            // In a random permutation of size 500, E[fixedPoints] = 1 and E[twoCycles] = 1
            expect(fixedPoints < 10).toBe(true);
            expect(twoCycles < 10).toBe(true);

            // 3. Zero-Fixed-Point Resistance: permute(0) does not collapse to 0 across keys
            const zeroOutputs = new Set();
            for (let k = 0; k < 20; k++) {
                const f = createCycleWalkingFeistel(N, `key-variation-${k}`);
                zeroOutputs.add(f.permute(0));
            }
            // At least 18 unique outputs for 20 different keys
            expect(zeroOutputs.size >= 18).toBe(true);
        });

    // =========================================================================
    // 10. 32-BIT UNSIGNED BITWISE SAFETY FOR N > 2^30 (TEST 10)
    // =========================================================================
    it('safely handles 32-bit unsigned boundaries for N > 2^30 without signed overflow', () => {
        // N > 2^30 requires k = 16 (half-block 16 bits, 2k = 32 bits, mask = 0xFFFF)
        const bigDomains = [
            0x40000001, // 2^30 + 1 (1,073,741,825)
            0x80000001, // 2^31 + 1 (2,147,483,649)
            3000000000,  // 3 Billion (> 2^31, signed int would be negative)
            0x100000000 // 2^32 (4,294,967,296 - exact 32-bit unsigned ceiling)
        ];

        for (const bigN of bigDomains) {
            const { permute, unpermute } = createCycleWalkingFeistel(bigN, `big-domain-seed-${bigN}`);

            // Test coordinates around 0, 2^31 - 1, 2^31, and bigN - 1
            const testCoords = [
                0,
                1,
                1000000,
                0x7FFFFFFF,         // 2,147,483,647 (max signed 32-bit int)
                0x80000000,         // 2,147,483,648 (bit 31 set)
                bigN - 2,
                bigN - 1
            ].filter(x => x < bigN);

            for (const x of testCoords) {
                const forward = permute(x);
                // Must be strictly non-negative and < bigN
                expect(forward >= 0).toBe(true);
                expect(forward < bigN).toBe(true);

                const recovered = unpermute(forward);
                expect(recovered).toBe(x);
            }
        }
    });

    // =========================================================================
    // 11. CALLER INPUT VALIDATION (OUT-OF-BOUNDS GUARDS)
    // =========================================================================
    it('strictly validates caller inputs: throws RangeError on negative, non-integer, or out-of-bounds coordinates', () => {
        const N = 100;
        const { permute, unpermute } = createCycleWalkingFeistel(N, 'guards-seed');

        const badInputs = [-1, -100, 100, 101, 1000, 3.14, -0.5, NaN, Infinity, -Infinity, '5', null, undefined];

        for (const bad of badInputs) {
            expect(() => permute(bad)).toThrow();
            expect(() => unpermute(bad)).toThrow();
        }

        // Valid boundary inputs must not throw
        expect(() => permute(0)).not.toThrow();
        expect(() => permute(N - 1)).not.toThrow();
        expect(() => unpermute(0)).not.toThrow();
        expect(() => unpermute(N - 1)).not.toThrow();
    });

    it('gracefully rejects invalid domains (N <= 0, non-integer, or > 2^32)', () => {
        expect(() => createCycleWalkingFeistel(0, 'seed')).toThrow();
        expect(() => createCycleWalkingFeistel(-10, 'seed')).toThrow();
        expect(() => createCycleWalkingFeistel(3.14, 'seed')).toThrow();
        expect(() => createCycleWalkingFeistel(0x100000001, 'seed')).toThrow(); // > 2^32
    });
});
