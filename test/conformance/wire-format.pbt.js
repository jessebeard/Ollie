import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { stcEmbed, stcExtract, bytesToBits, bitsToBytes } from '../../src/information-theory/steganography/stc-matrix.js';
import { packFramedPayload, unpackFramedPayload, selectBucketSize } from '../../src/information-theory/steganography/opaque-container.js';
import { hkdfExpand } from '../../src/information-theory/cryptography/kdf-chain.js';

describe('Format v4 Property-Based Tests (PBT)', () => {
    it('PBT: bitsToBytes(bytesToBits(bytes)) == bytes for arbitrary byte arrays', () => {
        for (let run = 0; run < 50; run++) {
            const len = Math.floor(Math.random() * 256) + 1;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
            const bits = bytesToBits(bytes);
            const recovered = bitsToBytes(bits);
            expect(Array.from(recovered)).toEqual(Array.from(bytes));
        }
    });

    it('PBT: packFramedPayload and unpackFramedPayload roundtrip for arbitrary payloads', async () => {
        for (let run = 0; run < 20; run++) {
            const len = Math.floor(Math.random() * 200) + 1;
            const payload = new Uint8Array(len);
            for (let i = 0; i < len; i++) payload[i] = (i * 17) & 0xFF;

            const bucket = selectBucketSize(len);
            const [framed, packErr] = await packFramedPayload(payload, bucket);
            expect(packErr).toBe(null);

            const [unpacked, unpackErr] = await unpackFramedPayload(framed);
            expect(unpackErr).toBe(null);
            expect(Array.from(unpacked)).toEqual(Array.from(payload));
        }
    });

    it('PBT: STC embedding and extraction achieves 100% fidelity over arbitrary covers and messages', () => {
        for (let run = 0; run < 20; run++) {
            const N = 400 + run * 20;
            const M = 20 + run * 2; // w >= 10
            const cover = new Int32Array(N);
            for (let i = 0; i < N; i++) cover[i] = (Math.random() * 10 - 5) | 0;

            const message = new Uint8Array(M);
            for (let i = 0; i < M; i++) message[i] = (Math.random() * 2) | 0;

            const rhoPlus = new Float64Array(N).fill(1.0);
            const rhoMinus = new Float64Array(N).fill(1.0);

            const [stego, err] = stcEmbed(cover, message, rhoPlus, rhoMinus, { h: 8, seed: `pbt-seed-${run}` });
            expect(err).toBe(null);

            const extracted = stcExtract(stego, M, { h: 8, seed: `pbt-seed-${run}` });
            expect(Array.from(extracted)).toEqual(Array.from(message));
        }
    });
});
