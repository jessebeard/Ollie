import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { splitSecret, combineShares } from '../../src/information-theory/secret-sharing/gf-shamir.js';

/** Deterministic LCG returning Uint8Array(n) - injected via options.random. */
function seededRandom(seed) {
    let s = seed >>> 0;
    return (n) => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            out[i] = (s >>> 24) & 0xFF;
        }
        return out;
    };
}

function bytes(str) {
    return new TextEncoder().encode(str);
}

async function makeShares(secret, threshold, total, seed = 42) {
    const [shares, err] = await splitSecret(secret, { threshold, total, random: seededRandom(seed) });
    expect(err).toBe(null);
    return shares;
}

describe('gf-shamir splitting', () => {

    it('produces total shares with valid indices and secret-length data', async () => {
        const shares = await makeShares(bytes('the secret'), 3, 5);
        expect(shares).toHaveLength(5);
        const indices = shares.map(s => s.index).sort((a, b) => a - b);
        expect(indices).toEqual([1, 2, 3, 4, 5]);
        for (const s of shares) {
            expect(s.data).toBeInstanceOf(Uint8Array);
            expect(s.data).toHaveLength(10);
        }
    });

    it('is deterministic under an injected RNG', async () => {
        const a = await makeShares(bytes('determinism'), 2, 4, 777);
        const b = await makeShares(bytes('determinism'), 2, 4, 777);
        expect(a.map(s => Array.from(s.data).join())).toEqual(b.map(s => Array.from(s.data).join()));
    });

    it('fails closed on bad parameters via tuples', async () => {
        const cases = [
            [new Uint8Array(0), { threshold: 2, total: 3 }],
            [bytes('x'), { threshold: 0, total: 3 }],
            [bytes('x'), { threshold: 4, total: 3 }],
            [bytes('x'), { threshold: 2, total: 1 }],
            [bytes('x'), { threshold: 2, total: 256 }]
        ];
        for (const [secret, opts] of cases) {
            const [, err] = await splitSecret(secret, { ...opts, random: seededRandom(1) });
            expect(err).toBeInstanceOf(Error);
        }
    });
});

describe('gf-shamir combination', () => {

    it('reconstructs from exactly the threshold shares regardless of order', async () => {
        const secret = bytes('threshold boundary');
        const shares = await makeShares(secret, 3, 5);

        const subsets = [
            shares.slice(0, 3),
            [shares[4], shares[0], shares[2]],
            [shares[3], shares[1], shares[0]]
        ];
        for (const subset of subsets) {
            const [out, err] = combineShares(subset, { threshold: 3 });
            expect(err).toBe(null);
            expect(Array.from(out)).toEqual(Array.from(secret));
        }
    });

    it('reconstructs from supersets larger than the threshold', async () => {
        const secret = bytes('superset');
        const shares = await makeShares(secret, 2, 4);
        const [out, err] = combineShares(shares, { threshold: 2 });
        expect(err).toBe(null);
        expect(Array.from(out)).toEqual(Array.from(secret));
    });

    it('refuses to run below the recorded threshold', async () => {
        const secret = bytes('too few');
        const shares = await makeShares(secret, 3, 5);
        const [, err] = combineShares(shares.slice(0, 2), { threshold: 3 });
        expect(err).toBeInstanceOf(Error);
    });

    it('rejects duplicate, zero, and out-of-range share indices', async () => {
        const shares = await makeShares(bytes('idx checks'), 2, 3);

        const dup = [{ index: 1, data: shares[0].data }, { index: 1, data: shares[1].data }];
        expect(combineShares(dup, { threshold: 2 })[1]).toBeInstanceOf(Error);

        const zeroIdx = [{ index: 0, data: shares[0].data }, { index: 2, data: shares[1].data }];
        expect(combineShares(zeroIdx, { threshold: 2 })[1]).toBeInstanceOf(Error);

        const bigIdx = [{ index: 1, data: shares[0].data }, { index: 99, data: shares[1].data }];
        expect(combineShares(bigIdx, { threshold: 2 })[1]).toBeInstanceOf(Error);
    });

    it('roundtrips arbitrary byte payloads (property)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 128)],
            async (secret) => {
                const [shares, err] = await splitSecret(secret, { threshold: 2, total: 3, random: seededRandom(secret.length + 7) });
                expect(err).toBe(null);
                const [out, outErr] = combineShares([shares[2], shares[0]], { threshold: 2 });
                expect(outErr).toBe(null);
                expect(out).toEqual(secret);
            },
            40
        );
    });
});
