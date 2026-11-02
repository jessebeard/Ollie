import { describe, it, expect } from '../../utils/test-runner.js';
import { planErasureAllocation, encodeErasure, decodeErasure } from '../../../src/information-theory/secret-sharing/cauchy-ec.js';

describe('Format v4.1 Cauchy MDS Invariant (Any k-Subset Quorum)', () => {
    it('enforces that sum of stripes across k smallest carriers is >= K_MDS', () => {
        // Heterogeneous carrier capacities: 2 large carriers (30KB each), 3 small carriers (5KB each)
        const capacities = [30000, 30000, 5000, 5000, 5000];
        const threshold = 3;
        const payloadSize = 6000;

        const [plan, err] = planErasureAllocation(capacities, {
            payloadSize,
            threshold,
            proportional: true
        });

        expect(err).toBe(null);
        expect(plan !== null).toBe(true);

        const counts = plan.counts;
        const k = plan.k;

        // Sort allocated stripe counts from smallest to largest
        const sortedCounts = [...counts].sort((a, b) => a - b);
        const sumSmallestK = sortedCounts.slice(0, k).reduce((a, b) => a + b, 0);

        // Required Mathematical Invariant: sum of k smallest carriers MUST be >= k
        expect(sumSmallestK >= k).toBe(true);
    });

    it('successfully reconstructs payload from the k smallest carriers (worst-case quorum)', () => {
        const capacities = [25000, 25000, 4000, 4000, 4000];
        const threshold = 3;
        const testData = new Uint8Array(4500);
        for (let i = 0; i < testData.length; i++) testData[i] = (i * 71 + 13) & 0xFF;

        const [plan, planErr] = planErasureAllocation(capacities, {
            payloadSize: testData.length,
            threshold,
            proportional: true
        });
        expect(planErr).toBe(null);

        // Encode erasure stripes
        const [codedChunks, encErr] = encodeErasure(testData, {
            k: plan.k,
            n: plan.n
        });
        expect(encErr).toBe(null);
        expect(codedChunks.length).toBe(plan.n);

        // Distribute coded chunks according to plan.counts
        const carrierChunks = [];
        let chunkCursor = 0;
        for (let i = 0; i < capacities.length; i++) {
            const count = plan.counts[i];
            const myChunks = [];
            for (let c = 0; c < count; c++) {
                myChunks.push(codedChunks[chunkCursor]);
                chunkCursor++;
            }
            carrierChunks.push({
                carrierIndex: i,
                capacity: capacities[i],
                chunks: myChunks
            });
        }

        // Select the k carriers with the SMALLEST capacities (worst-case scenario)
        carrierChunks.sort((a, b) => a.capacity - b.capacity);
        const worstCaseKSubset = carrierChunks.slice(0, threshold);

        // Collect all chunks held by this worst-case k-subset
        const collectedChunks = [];
        for (const carrier of worstCaseKSubset) {
            for (const ch of carrier.chunks) {
                collectedChunks.push(ch);
            }
        }

        // Must possess >= k stripes to reconstruct
        expect(collectedChunks.length >= plan.k).toBe(true);

        const [recovered, decErr] = decodeErasure(collectedChunks, {
            k: plan.k,
            n: plan.n,
            size: testData.length
        });

        expect(decErr).toBe(null);
        expect(recovered !== null).toBe(true);
        expect(Array.from(recovered)).toEqual(Array.from(testData));
    });
});
