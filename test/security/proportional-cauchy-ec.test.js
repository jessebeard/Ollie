import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import {
    planErasureAllocation,
    encodeErasure,
    decodeErasure
} from '../../src/information-theory/secret-sharing/cauchy-ec.js';

describe('Proportional Cauchy Parity Erasure Coding (Unit & PBT)', () => {

    it('planErasureAllocation: allocates proportional block counts matching capacities', () => {
        // High-res photo (450KB), 2 medium photos (40KB, 25KB), small photo (10KB)
        const capacities = [450000, 40000, 25000, 10000];
        const payloadSize = 100000; // 100 KB payload

        const [plan, planErr] = planErasureAllocation(capacities, { payloadSize, margin: 512 });
        expect(planErr).toBe(null);
        expect(plan !== null).toBe(true);
        expect(plan.k >= 8).toBe(true); // Source blocks
        expect(plan.stripeSize > 0).toBe(true);
        expect(plan.counts[0] > plan.counts[1]).toBe(true);
        expect(plan.counts[1] > plan.counts[2]).toBe(true);
        expect(plan.counts[2] >= plan.counts[3]).toBe(true);

        // The largest carrier alone should hold at least k blocks (>= 100KB capacity)
        expect(plan.counts[0] >= plan.k).toBe(true);
    });

    it('encodeErasure & decodeErasure: roundtrips with any subset of k blocks', () => {
        const payload = new Uint8Array(64 * 1024); // 64 KB
        for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xFF;

        const k = 16;
        const totalBlocks = 48; // 3x redundancy
        const [coded, encErr] = encodeErasure(payload, { k, n: totalBlocks });
        expect(encErr).toBe(null);
        expect(coded.length).toBe(totalBlocks);

        // Test 1: First k blocks
        const subset1 = coded.slice(0, k);
        const [recovered1, decErr1] = decodeErasure(subset1, { k, n: totalBlocks, size: payload.length });
        expect(decErr1).toBe(null);
        expect(recovered1.length).toBe(payload.length);
        for (let i = 0; i < payload.length; i++) expect(recovered1[i]).toBe(payload[i]);

        // Test 2: Last k blocks
        const subset2 = coded.slice(totalBlocks - k);
        const [recovered2, decErr2] = decodeErasure(subset2, { k, n: totalBlocks, size: payload.length });
        expect(decErr2).toBe(null);
        for (let i = 0; i < payload.length; i++) expect(recovered2[i]).toBe(payload[i]);

        // Test 3: Dispersed random subset of k blocks
        const dispersed = [];
        for (let i = 0; i < totalBlocks; i += Math.floor(totalBlocks / k)) {
            dispersed.push(coded[i]);
            if (dispersed.length === k) break;
        }
        const [recovered3, decErr3] = decodeErasure(dispersed, { k, n: totalBlocks, size: payload.length });
        expect(decErr3).toBe(null);
        for (let i = 0; i < payload.length; i++) expect(recovered3[i]).toBe(payload[i]);
    });

    it('Property: Capacity-Proportional Recovery Across Arbitrary Subsets (PBT)', async () => {
        await assertProperty(
            [
                Arbitrary.integer(1024, 65536),
                Arbitrary.integer(80000, 200000),
                Arbitrary.integer(20000, 60000),
                Arbitrary.integer(15000, 40000),
                Arbitrary.integer(5000, 20000)
            ],
            async (payloadLen, capLarge, capMed1, capMed2, capSmall) => {
                const payload = new Uint8Array(payloadLen);
                for (let i = 0; i < payloadLen; i++) payload[i] = (i * 17 + 13) & 0xFF;

                const capacities = [capLarge, capMed1, capMed2, capSmall];
                const totalCap = capacities.reduce((a, b) => a + b, 0);
                if (payloadLen > totalCap - 4 * 512) return true; // Skip if payload exceeds total carrier capacity

                const [plan, planErr] = planErasureAllocation(capacities, { payloadSize: payloadLen, margin: 512 });
                if (planErr) return true;

                const [coded, encErr] = encodeErasure(payload, { k: plan.k, n: plan.n });
                if (encErr) return false;

                // Divide coded blocks into carrier buckets based on plan.counts
                const carrierBuckets = [];
                let offset = 0;
                for (let i = 0; i < capacities.length; i++) {
                    const count = plan.counts[i];
                    carrierBuckets.push(coded.slice(offset, offset + count));
                    offset += count;
                }

                // Check 1: If large carrier alone has >= k blocks, it alone recovers the payload
                if (carrierBuckets[0].length >= plan.k) {
                    const subset = carrierBuckets[0].slice(0, plan.k);
                    const [recovered, decErr] = decodeErasure(subset, { k: plan.k, n: plan.n, size: payloadLen });
                    if (decErr || !recovered) return false;
                    for (let p = 0; p < payloadLen; p++) {
                        if (recovered[p] !== payload[p]) return false;
                    }
                }

                // Check 2: Combine smaller carriers (indices 1, 2, 3)
                const smallCombined = [...carrierBuckets[1], ...carrierBuckets[2], ...carrierBuckets[3]];
                if (smallCombined.length >= plan.k) {
                    const subset = smallCombined.slice(0, plan.k);
                    const [recovered, decErr] = decodeErasure(subset, { k: plan.k, n: plan.n, size: payloadLen });
                    if (decErr || !recovered) return false;
                    for (let p = 0; p < payloadLen; p++) {
                        if (recovered[p] !== payload[p]) return false;
                    }
                }

                return true;
            },
            25
        );
    });

    it('Metamorphic: Invariance under different subset selections', () => {
        const payload = new Uint8Array(32768);
        for (let i = 0; i < payload.length; i++) payload[i] = (i ^ 0xAA) & 0xFF;

        const k = 12;
        const n = 36;
        const [coded] = encodeErasure(payload, { k, n });

        // Subset A (first 12)
        const [recA] = decodeErasure(coded.slice(0, k), { k, n, size: payload.length });
        // Subset B (last 12)
        const [recB] = decodeErasure(coded.slice(n - k), { k, n, size: payload.length });
        // Subset C (even indices)
        const [recC] = decodeErasure(coded.filter((_, i) => i % 3 === 0).slice(0, k), { k, n, size: payload.length });

        for (let i = 0; i < payload.length; i++) {
            expect(recA[i]).toBe(recB[i]);
            expect(recB[i]).toBe(recC[i]);
        }
    });

    it('Fuzz & Boundary: Sub-threshold input fails safely with typed error', () => {
        const payload = new Uint8Array(4096);
        const k = 8;
        const n = 16;
        const [coded] = encodeErasure(payload, { k, n });

        // Only 7 blocks (need 8)
        const [rec, err] = decodeErasure(coded.slice(0, 7), { k, n, size: payload.length });
        expect(rec).toBe(null);
        expect(err instanceof Error).toBe(true);
    });
});
