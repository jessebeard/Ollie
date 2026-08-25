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
        if (chunks.length !== 5) throw new Error('chunk count mismatch');
        const expected = Math.ceil(1001 / 3);
        chunks.forEach((c, i) => {
            if (c.index !== i) throw new Error('indices must be 0..n-1');
            if (!(c.data instanceof Uint8Array) || c.data.length !== expected) {
                throw new Error(`chunk ${i} length ${c.data.length} != ${expected}`);
            }
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
            if (!(err instanceof Error)) throw new Error(`accepted ${JSON.stringify(opts)} len=${data.length}`);
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

            if (subsets.length === 0) throw new Error('no subsets generated');
            for (const subset of subsets) {
                const [out, err] = decodeErasure(subset, { k, n, size: L });
                if (err) throw new Error(`subset [${subset.map(s => s.index)}] errored: ${err.message}`);
                if (!sameBytes(out, data)) {
                    throw new Error(`subset [${subset.map(s => s.index)}] reconstructed wrong data`);
                }
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
        if (!(tooFew instanceof Error)) throw new Error('sub-k accepted');

        const dup = [chunks[0], { index: 0, data: chunks[1].data }, chunks[2]];
        const [, dupErr] = decodeErasure(dup, { k: 3, n: 5, size: 100 });
        if (!(dupErr instanceof Error)) throw new Error('duplicate index accepted');

        const oob = [chunks[0], { index: 9, data: chunks[1].data }, chunks[2]];
        const [, oobErr] = decodeErasure(oob, { k: 3, n: 5, size: 100 });
        if (!(oobErr instanceof Error)) throw new Error('out-of-range index accepted');

        const shorty = [chunks[0], { index: 1, data: chunks[1].data.slice(0, 10) }, chunks[2]];
        const [, lenErr] = decodeErasure(shorty, { k: 3, n: 5, size: 100 });
        if (!(lenErr instanceof Error)) throw new Error('mismatched chunk lengths accepted');
    });

    it('roundtrips arbitrary payloads through a fixed subset (property)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 600)],
            async (data) => {
                const [chunks, encErr] = encodeErasure(data, { k: 2, n: 4 });
                if (encErr) throw encErr;
                const [out, decErr] = decodeErasure([chunks[3], chunks[0]], { k: 2, n: 4, size: data.length });
                if (decErr) throw decErr;
                if (!sameBytes(out, data)) throw new Error('mismatch');
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
        plan.counts.forEach((c, i) => {
            if (c > 1) throw new Error(`carrier ${i} assigned ${c} stripes; physical format allows at most 1`);
        });
        // Spread-first: the 50KB carrier can host one stripe, so all three
        // participate (n=3 tolerates losing 1 file; concentration on the two
        // large carriers would tolerate none).
        if (plan.n !== 3) throw new Error(`expected n=3 (max participation), got ${plan.n}`);
        if (plan.counts.reduce((a, b) => a + b, 0) !== plan.n) throw new Error('counts must sum to n');
        if (plan.maxPayload !== 2 * plan.stripeSize) {
            throw new Error(`maxPayload must be k*stripeSize (${plan.maxPayload} vs ${2 * plan.stripeSize})`);
        }
    });

    it('never concentrates stripes onto a single carrier (user-reported regression)', () => {
        // One large photo + ten small ones, threshold 5: the old Max-S policy
        // returned counts=[6,0,...,0], writing every stripe into ONE file.
        const caps = [2_000_000, ...Array(10).fill(300_000)];
        const [plan, err] = planErasureAllocation(caps, { threshold: 5, margin: 512 });
        expect(err).toBe(null);
        if (plan.n < 5) throw new Error(`n=${plan.n} below threshold`);
        if (Math.max(...plan.counts) !== 1) throw new Error('a carrier received multiple stripes');
        if (plan.counts.filter(c => c === 1).length !== plan.n) throw new Error('participants must each carry exactly one stripe');
    });

    it('honors payloadSize as a floor on stripe size', () => {
        const caps = [600_000, 600_000, 600_000, 600_000, 600_000, 600_000, 100_000, 100_000];
        const payload = 2_400_000;
        const [plan, err] = planErasureAllocation(caps, { threshold: 6, margin: 512, payloadSize: payload });
        expect(err).toBe(null);
        if (plan.stripeSize < Math.ceil(payload / 6)) throw new Error('stripe smaller than required');
        // Small carriers cannot host a full required stripe: excluded.
        if (plan.n !== 6) throw new Error(`expected 6 participants, got ${plan.n}`);
    });

    it('rejects payloads that no threshold-subset of carriers can host', () => {
        const [, err] = planErasureAllocation(
            [600_000, 600_000, 600_000],
            { threshold: 3, margin: 512, payloadSize: 5_000_000 }
        );
        if (!(err instanceof Error)) throw new Error('oversized payload accepted');
        if (!err.message.includes('payload')) throw new Error('error should mention the payload');
    });

    it('is deterministic and consistent', () => {
        const caps = [1200, 4000, 4000];
        const a = planErasureAllocation(caps, { threshold: 2, margin: 64 })[0];
        const b = planErasureAllocation(caps, { threshold: 2, margin: 64 })[0];
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));

        // Every carrier must actually be able to hold its assigned stripe.
        caps.forEach((cap, i) => {
            if (cap - 64 < a.counts[i] * a.stripeSize && a.counts[i] > 0) {
                throw new Error(`carrier ${i} overallocated`);
            }
        });
    });

    it('gives zero stripes to carriers too small for even one', () => {
        const [plan, err] = planErasureAllocation(
            [100, 2_000_000, 2_000_000, 2_000_000],
            { threshold: 2, margin: 512 }
        );
        expect(err).toBe(null);
        if (plan.counts[0] !== 0) throw new Error('tiny carrier should carry zero stripes');
        if (plan.n !== 3) throw new Error(`expected the three large carriers to participate, got n=${plan.n}`);
    });

    it('rejects infeasible sets via tuple', () => {
        const [, err] = planErasureAllocation(
            [600, 600],
            { threshold: 2, margin: 512 }
        );
        if (!(err instanceof Error)) throw new Error('infeasible capacity set accepted');
    });
});
