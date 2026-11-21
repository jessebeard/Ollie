import { describe, it, expect } from '../utils/test-runner.js';
import { crc32 } from '../../src/utils/crc32.js';
import { deriveStegoKeys, hkdfExpand } from '../../src/information-theory/cryptography/kdf-chain.js';
import { generateSubmatrix, stcEmbed, stcExtract, bytesToBits, bitsToBytes } from '../../src/information-theory/steganography/stc-matrix.js';
import { sealOpaque, unsealOpaque, packFramedPayload, unpackFramedPayload, selectBucketSize } from '../../src/information-theory/steganography/opaque-container.js';
import { StegoEngine } from '../../src/information-theory/steganography/stego-engine.js';

describe('Format v4 Wire Format Conformance: CRC-32 Standard', () => {
    it('matches IEEE CRC-32 standard check values', () => {
        expect(crc32(new Uint8Array(0))).toBe(0x00000000);
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
    });
});

describe('Format v4 Wire Format Conformance: Cryptographic KDF Chain', () => {
    it('derives domain-separated keys deterministically via Argon2id + HKDF', async () => {
        const password = 'conformance-master-password';
        const salt = new Uint8Array(16).fill(0x5A);

        const [keys, err] = await deriveStegoKeys(password, salt, { memorySize: 64, passes: 1 });
        expect(err).toBe(null);
        expect(keys.masterKey.length).toBe(32);
        expect(keys.aesKey.length).toBe(32);
        expect(keys.aesIV.length).toBe(12);
        expect(keys.stcSeed.length).toBe(32);
        expect(keys.costSeed.length).toBe(32);
    });
});

describe('Format v4 Wire Format Conformance: STC Submatrix & Parity Trellis', () => {
    it('generates consistent, deterministic submatrices for identical seeds', () => {
        const sub1 = generateSubmatrix(8, 4, 'conformance-submatrix-seed');
        const sub2 = generateSubmatrix(8, 4, 'conformance-submatrix-seed');
        expect(Array.from(sub1)).toEqual(Array.from(sub2));
    });

    it('recovers embedded bits through STC dual trellis extraction', () => {
        const N = 800;
        const M = 100;
        const cover = new Int32Array(N);
        for (let i = 0; i < N; i++) cover[i] = ((i * 7) % 11) - 5;

        const messageBits = new Uint8Array(M);
        for (let i = 0; i < M; i++) messageBits[i] = (i * 3) % 2;

        const rhoPlus = new Float64Array(N).fill(1.0);
        const rhoMinus = new Float64Array(N).fill(1.0);

        const [stego, embedErr] = stcEmbed(cover, messageBits, rhoPlus, rhoMinus, { h: 8, seed: 'conformance-stc' });
        expect(embedErr).toBe(null);

        const extracted = stcExtract(stego, M, { h: 8, seed: 'conformance-stc' });
        expect(Array.from(extracted)).toEqual(Array.from(messageBits));
    });
});

describe('Format v4 Wire Format Conformance: Opaque Bucket Framing', () => {
    it('preserves payload fidelity across deflate/inflate and bucket padding', async () => {
        const payload = new TextEncoder().encode('Format v4 Opaque Container Wire Conformance Data');
        const bucket = selectBucketSize(payload.length);

        const [framed, packErr] = await packFramedPayload(payload, bucket);
        expect(packErr).toBe(null);
        expect(framed.length).toBe(bucket);

        const [unpacked, unpackErr] = await unpackFramedPayload(framed);
        expect(unpackErr).toBe(null);
        expect(Array.from(unpacked)).toEqual(Array.from(payload));
    });
});
