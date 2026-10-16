import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import {
    encodeErasure,
    decodeErasure,
    planErasureAllocation
} from '../../src/information-theory/secret-sharing/cauchy-ec.js';

function payload(len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = (i * 31 + 7) & 0xFF;
    return out;
}

function sameBytes(a, b) {
    return a.length === b.length && a.join() === b.join();
}

async function encoded(L, k, n) {
    const [chunks, err] = encodeErasure(payload(L), { k, n });
    expect(err).toBe(null);
    return chunks;
}

describe('cauchy-ec encoding geometry', () => {

    it('produces n chunks of ceil(L/k) bytes with sequential indices', async () => {
        const chunks = await encoded(1001, 3, 5);
        expect(chunks).toHaveLength(5);
        const expected = Math.ceil(1001 / 3);
        chunks.forEach((c, i) => {
            expect(c.index).toBe(i);
            expect(c.data).toBeInstanceOf(Uint8Array);
            expect(c.data).toHaveLength(expected);
        });
    });

    it('is deterministic for identical inputs', async () => {
        const a = await encoded(500, 2, 4);
        const b = await encoded(500, 2, 4);
        expect(a.map(c => Array.from(c.data).join())).toEqual(b.map(c => Array.from(c.data).join()));
    });

    it('fails closed on invalid parameters', async () => {
        const bad = [
            [new Uint8Array(0), { k: 1, n: 2 }],
            [payload(10), { k: 0, n: 2 }],
            [payload(10), { k: 3, n: 2 }],
            [payload(10), { k: 2, n: 254 }]   // k + n must stay <= 255
        ];
        for (const [data, opts] of bad) {
            const [, err] = encodeErasure(data, opts);
            expect(err).toBeInstanceOf(Error);
        }
    });
});

describe('cauchy-ec decoding (MDS guarantee)', () => {

    const combos = [[1, 3, 5], [2, 3, 1001], [3, 5, 777], [2, 8, 64], [4, 4, 123]];

    combos.forEach(([k, n, L]) => {
        it(`roundtrips EVERY k-subset for k=${k}, n=${n}, L=${L}`, async () => {
            const data = payload(L);
            const chunks = await encoded(L, k, n);

            // enumerate all C(n,k) subsets
            const subsets = [];
            const rec = (start, acc) => {
                if (acc.length === k) { subsets.push([...acc]); return; }
                for (let i = start; i < n; i++) rec(i + 1, [...acc, chunks[i]]);
            };
            rec(0, []);

            expect(subsets.length).toBeGreaterThan(0);
            for (const subset of subsets) {
                const [out, err] = decodeErasure(subset, { k, n, size: L });
                expect(err).toBe(null);
                expect(sameBytes(out, data)).toBe(true);
            }
        });
    });

    it('accepts supersets beyond k by using the first k valid rows', async () => {
        const data = payload(300);
        const chunks = await encoded(300, 2, 6);
        const [out, err] = decodeErasure(chunks, { k: 2, n: 6, size: 300 });
        expect(err).toBe(null);
        expect(sameBytes(out, data)).toBe(true);
    });

    it('fails closed below k and on malformed input', async () => {
        const chunks = await encoded(100, 3, 5);

        const [, tooFew] = decodeErasure(chunks.slice(0, 2), { k: 3, n: 5, size: 100 });
        expect(tooFew).toBeInstanceOf(Error);

        const dup = [chunks[0], { index: 0, data: chunks[1].data }, chunks[2]];
        const [, dupErr] = decodeErasure(dup, { k: 3, n: 5, size: 100 });
        expect(dupErr).toBeInstanceOf(Error);

        const oob = [chunks[0], { index: 9, data: chunks[1].data }, chunks[2]];
        const [, oobErr] = decodeErasure(oob, { k: 3, n: 5, size: 100 });
        expect(oobErr).toBeInstanceOf(Error);

        const shorty = [chunks[0], { index: 1, data: chunks[1].data.slice(0, 10) }, chunks[2]];
        const [, lenErr] = decodeErasure(shorty, { k: 3, n: 5, size: 100 });
        expect(lenErr).toBeInstanceOf(Error);
    });

    it('roundtrips arbitrary payloads through a fixed subset (property)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 600)],
            async (data) => {
                const [chunks, encErr] = encodeErasure(data, { k: 2, n: 4 });
                expect(encErr).toBe(null);
                const [out, decErr] = decodeErasure([chunks[3], chunks[0]], { k: 2, n: 4, size: data.length });
                expect(decErr).toBe(null);
                expect(sameBytes(out, data)).toBe(true);
            },
            40
        );
    });
});

describe('planErasureAllocation (spread-first)', () => {

    it('spreads one stripe per carrier and includes small carriers when possible', () => {
        const [plan, err] = planErasureAllocation(
            [50_000, 5_000_000, 5_000_000],
            { threshold: 2, margin: 512 }
        );
        expect(err).toBe(null);

        // One container per file: no carrier may ever hold two stripes.
        plan.counts.forEach((c) => {
            expect(c <= 1).toBe(true);
        });
        // Spread-first: the 50KB carrier can host one stripe, so all three
        // participate (n=3 tolerates losing 1 file; concentration on the two
        // large carriers would tolerate none).
        expect(plan.n).toBe(3);
        expect(plan.counts.reduce((a, b) => a + b, 0)).toBe(plan.n);
        expect(plan.maxPayload).toBe(2 * plan.stripeSize);
    });

    it('never concentrates stripes onto a single carrier (user-reported regression)', () => {
        // One large photo + ten small ones, threshold 5: the old Max-S policy
        // returned counts=[6,0,...,0], writing every stripe into ONE file.
        const caps = [2_000_000, ...Array(10).fill(300_000)];
        const [plan, err] = planErasureAllocation(caps, { threshold: 5, margin: 512 });
        expect(err).toBe(null);
        expect(plan.n).toBeGreaterThanOrEqual(5);
        expect(Math.max(...plan.counts)).toBe(1);
        expect(plan.counts.filter(c => c === 1)).toHaveLength(plan.n);
    });

    it('honors payloadSize as a floor on stripe size', () => {
        const caps = [600_000, 600_000, 600_000, 600_000, 600_000, 600_000, 100_000, 100_000];
        const payload = 2_400_000;
        const [plan, err] = planErasureAllocation(caps, { threshold: 6, margin: 512, payloadSize: payload });
        expect(err).toBe(null);
        expect(plan.stripeSize).toBeGreaterThanOrEqual(Math.ceil(payload / 6));
        // Small carriers cannot host a full required stripe: excluded.
        expect(plan.n).toBe(6);
    });

    it('rejects payloads that no threshold-subset of carriers can host', () => {
        const [, err] = planErasureAllocation(
            [600_000, 600_000, 600_000],
            { threshold: 3, margin: 512, payloadSize: 5_000_000 }
        );
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/payload/i);
    });

    it('is deterministic and consistent', () => {
        const caps = [1200, 4000, 4000];
        const a = planErasureAllocation(caps, { threshold: 2, margin: 64 })[0];
        const b = planErasureAllocation(caps, { threshold: 2, margin: 64 })[0];
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));

        // Every carrier must actually be able to hold its assigned stripe.
        caps.forEach((cap, i) => {
            if (a.counts[i] > 0) {
                expect(cap - 64).toBeGreaterThanOrEqual(a.counts[i] * a.stripeSize);
            }
        });
    });

    it('gives zero stripes to carriers too small for even one', () => {
        const [plan, err] = planErasureAllocation(
            [100, 2_000_000, 2_000_000, 2_000_000],
            { threshold: 2, margin: 512 }
        );
        expect(err).toBe(null);
        expect(plan.counts[0]).toBe(0);
        expect(plan.n).toBe(3);
    });

    it('rejects infeasible sets via tuple', () => {
        const [, err] = planErasureAllocation(
            [600, 600],
            { threshold: 2, margin: 512 }
        );
        expect(err).toBeInstanceOf(Error);
    });
});
