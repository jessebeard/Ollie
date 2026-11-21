import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { sealPayload, openEnvelope } from '../../src/information-theory/secret-sharing/css-envelope.js';

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

async function sealed(payload, threshold = 2, total = 4) {
    const [result, err] = await sealPayload(payload, { threshold, total });
    expect(err).toBe(null);
    return result;
}

describe('css-envelope sealing', () => {

    it('produces a 12-byte IV envelope and total shares', async () => {
        const payload = bytes('vault document bytes');
        const { envelope, shares } = await sealed(payload, 3, 5);

        expect(envelope.iv).toBeInstanceOf(Uint8Array);
        expect(envelope.iv).toHaveLength(12);
        expect(envelope.ciphertext).toBeInstanceOf(Uint8Array);
        expect(envelope.ciphertext).toHaveLength(payload.length + 16);
        expect(shares).toHaveLength(5);
    });

    it('never exposes the data-encryption key in shares or envelope', async () => {
        // With an injected RNG the DEK equals the first 32 bytes of the
        // random stream; nothing else may contain that sequence.
        const rng = seededRandom(31337);
        const drawn = [];
        const wrapped = (n) => { const b = rng(n); drawn.push(b); return b; };
        const payload = bytes('secret');
        const [result] = await sealPayload(payload, { threshold: 2, total: 3, random: wrapped });

        const dek = drawn.find(b => b.length === 32);
        expect(dek).toBeDefined();

        const blobs = [
            ...result.shares.map(s => Array.from(s.data).join()),
            Array.from(result.envelope.ciphertext).join(),
            Array.from(result.envelope.iv).join()
        ].join('|');

        expect(blobs.includes(Array.from(dek).join())).toBe(false);
    });

    it('rejects bad parameters via tuples', async () => {
        const [, emptyErr] = await sealPayload(new Uint8Array(0), { threshold: 1, total: 1 });
        expect(emptyErr).toBeInstanceOf(Error);

        const [, optsErr] = await sealPayload(bytes('x'), { threshold: 5, total: 3 });
        expect(optsErr).toBeInstanceOf(Error);
    });
});

describe('css-envelope opening', () => {

    it('roundtrips from any threshold subset in any order', async () => {
        const payload = bytes('{"metadata":{"revision":9}}');
        const { envelope, shares } = await sealed(payload, 3, 5);

        const subsets = [
            [shares[0], shares[1], shares[2]],
            [shares[4], shares[1], shares[3]],
            [shares[2], shares[4], shares[0]],
            shares
        ];
        for (const subset of subsets) {
            const [out, err] = await openEnvelope(envelope, subset, { threshold: 3 });
            expect(err).toBe(null);
            expect(Array.from(out)).toEqual(Array.from(payload));
        }
    });

    it('fails closed below the threshold even with valid shares', async () => {
        const { envelope, shares } = await sealed(bytes('two of five'), 3, 5);
        const [, err] = await openEnvelope(envelope, shares.slice(0, 2), { threshold: 3 });
        expect(err).toBeInstanceOf(Error);
    });

    it('rejects tampered ciphertext even with every share present', async () => {
        const payload = bytes('authenticated payload');
        const { envelope, shares } = await sealed(payload, 2, 3);

        const tampered = { iv: envelope.iv, ciphertext: Uint8Array.from(envelope.ciphertext) };
        tampered.ciphertext[0] ^= 0x01;

        const [, err] = await openEnvelope(tampered, shares, { threshold: 2 });
        expect(err).toBeInstanceOf(Error);
    });

    it('refuses shares from a different sealing operation', async () => {
        const first = await sealed(bytes('first secret'), 2, 3);
        const second = await sealed(bytes('second secret'), 2, 3);

        const mixedShares = [second.shares[0], second.shares[1]];
        const [, err] = await openEnvelope(first.envelope, mixedShares, { threshold: 2 });
        expect(err).toBeInstanceOf(Error);
    });

    it('roundtrips arbitrary payloads up to vault scale (property)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(16, 512)],
            async (payload) => {
                const [result, err] = await sealPayload(payload, { threshold: 2, total: 3, random: seededRandom(payload.length) });
                expect(err).toBe(null);
                const [out, outErr] = await openEnvelope(result.envelope, result.shares.slice(1), { threshold: 2 });
                expect(outErr).toBe(null);
                expect(out).toEqual(payload);
            },
            25
        );
    });
});
