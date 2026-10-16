import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { encodeErasure, decodeErasure } from '../../src/information-theory/secret-sharing/cauchy-ec.js';

describe('Secret Sharing Dedicated PBT Suite', () => {
    it('Property: Cauchy MDS erasure code recovers original data from ANY k of n chunks', async () => {
        await assertProperty(
            [Arbitrary.byteArray(16, 256), Arbitrary.integer(2, 5), Arbitrary.integer(1, 3)],
            (data, k, extra) => {
                const n = k + extra;
                const [chunks, encErr] = encodeErasure(data, { k, n });
                expect(encErr).toBe(null);
                expect(chunks.length).toBe(n);

                // Randomly select k distinct chunks from the n chunks (testing arbitrary subset & order insensitivity)
                const indices = Array.from({ length: n }, (_, i) => i);
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                const survivingChunks = indices.slice(0, k).map(idx => chunks[idx]);
                expect(survivingChunks.length).toBe(k);

                const [recovered, decErr] = decodeErasure(survivingChunks, { k, n, size: data.length });
                expect(decErr).toBe(null);
                expect(Array.from(recovered)).toEqual(Array.from(data));
            },
            40
        );
    });

    it('Property: decodeErasure strictly fails closed when fewer than k chunks or duplicate chunks are provided', async () => {
        await assertProperty(
            [Arbitrary.byteArray(32, 128), Arbitrary.integer(3, 5)],
            (data, k) => {
                const n = k + 2;
                const [chunks, encErr] = encodeErasure(data, { k, n });
                expect(encErr).toBe(null);

                // Fewer than k chunks must fail
                const insufficient = chunks.slice(0, k - 1);
                const [recSub, errSub] = decodeErasure(insufficient, { k, n, size: data.length });
                expect(recSub).toBe(null);
                expect(errSub instanceof Error).toBe(true);

                // Duplicate chunk index must fail
                const duplicates = [chunks[0], chunks[0], ...chunks.slice(2, k + 1)];
                const [recDup, errDup] = decodeErasure(duplicates, { k, n, size: data.length });
                expect(recDup).toBe(null);
                expect(errDup instanceof Error).toBe(true);
            },
            30
        );
    });
});
