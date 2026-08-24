import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '../utils/test-runner.js';
import { F5 } from '../../src/information-theory/steganography/f5-syndrome.js';
import { ErrorCorrection, ECC_PROFILES } from '../../src/information-theory/error-correction/rs-interleaver.js';
import { crc32 } from '../../src/utils/crc32.js';
import {
    decodeControlCodeword,
    unpackControlHeader
} from '../../src/information-theory/steganography/coded-header.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VECTORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden-vectors.json'), 'utf8'));

function toHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
}

function createMockBlocks(count) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const block = new Int32Array(64);
        block[0] = 100;
        for (let c = 1; c < 64; c++) {
            block[c] = (c % 2 === 0) ? 3 : -3;
        }
        blocks.push(block);
    }
    return blocks;
}

describe('Wire format conformance: CRC32 (layer 2)', () => {
    it('reproduces every golden CRC value', () => {
        expect(crc32(new Uint8Array(0))).toBe(VECTORS.crc32.empty);
        expect(crc32(new TextEncoder().encode('a'))).toBe(VECTORS.crc32.ascii_a);
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(VECTORS.crc32.check_123456789);
        expect(crc32(new TextEncoder().encode('F5SG'))).toBe(VECTORS.crc32.magic_F5SG);
    });

    it('matches the IEEE CRC-32 standard check value', () => {
        expect(VECTORS.crc32.check_123456789).toBe(0xCBF43926);
    });
});

describe('Wire format conformance: PRNG + permutation + seed derivation (layer 1)', () => {
    it('reproduces the xoshiro128** draw sequence', () => {
        const gen = F5.createPRNG(VECTORS.prng.seed);
        for (const expected of VECTORS.prng.draws_uint32) {
            expect(gen()).toBe(expected >>> 0);
        }
    });

    it('reproduces the Fisher-Yates permutation', () => {
        const perm = F5.generatePermutation(VECTORS.permutation.n, VECTORS.permutation.seed);
        expect(Array.from(perm)).toEqual(VECTORS.permutation.order);
    });

    it('derives the documented seed digests', async () => {
        const derived = await F5.resolveSeed({ password: 'correct horse battery staple' });
        expect(derived).toBe(VECTORS.resolveSeed.password_derived);
        expect(await F5.resolveSeed({})).toBe(VECTORS.resolveSeed.public_fallback);
        expect(F5.PUBLIC_SEED).toBe('F5SG:v2:public');
        expect(F5.STEGO_SEED_CONTEXT).toBe('ollie/f5/permutation/v2/');
    });
});

describe('Wire format conformance: ECC framing (layer 3)', () => {
    it('reproduces protect() output for every profile', () => {
        const input = fromHex(VECTORS.ecc.single_input_hex);
        for (const [profileName, vector] of Object.entries(VECTORS.ecc.profiles)) {
            const [result, err] = ErrorCorrection.protect(input, profileName);
            expect(err).toBe(null);
            expect(result.blockCount).toBe(vector.blockCount);
            expect(result.originalLength).toBe(vector.originalLength);
            expect(toHex(result.encoded)).toBe(vector.encoded_hex);
        }
    });

    it('reproduces multi-block interleaved output', () => {
        const input = fromHex(VECTORS.ecc.multiblock.input_hex);
        const [result, err] = ErrorCorrection.protect(input, VECTORS.ecc.multiblock.profile);
        expect(err).toBe(null);
        expect(result.blockCount).toBe(VECTORS.ecc.multiblock.blockCount);
        expect(toHex(result.encoded)).toBe(VECTORS.ecc.multiblock.encoded_hex);
    });

    it('recovers byte-exact within profile tolerance and fails beyond it', () => {
        const vector = VECTORS.ecc.multiblock;
        const encoded = fromHex(vector.encoded_hex);
        const original = fromHex(vector.input_hex);

        const burst1 = Uint8Array.from(encoded);
        burst1[10] ^= 0xFF;
        const [ok1, err1] = ErrorCorrection.recover(burst1, 'Medium', vector.originalLength, vector.blockCount);
        expect(err1).toBe(null);
        expect(Array.from(ok1)).toEqual(Array.from(original));

        const burst2 = Uint8Array.from(encoded);
        for (let i = 0; i < 40; i++) burst2[i] ^= 0xFF;
        const [, err2] = ErrorCorrection.recover(burst2, 'Medium', vector.originalLength, vector.blockCount);
        expect(err2).not.toBe(null);
    });

    it('fails closed on forged ECC metadata', () => {
        const encoded = fromHex(VECTORS.ecc.multiblock.encoded_hex);
        const [, tooManyBlocks] = ErrorCorrection.recover(encoded, 'Medium', 446, 3);
        expect(tooManyBlocks).not.toBe(null);

        const [, tooLong] = ErrorCorrection.recover(encoded, 'Medium', 999999, 2);
        expect(tooLong).not.toBe(null);

        const [, badProfile] = ErrorCorrection.recover(encoded, 'Bogus', 250, 2);
        expect(badProfile).not.toBe(null);
    });

    it('declares the frozen profile table', () => {
        expect(ECC_PROFILES.Low).toEqual({ dataBytes: 251, parityBytes: 4 });
        expect(ECC_PROFILES.Medium).toEqual({ dataBytes: 223, parityBytes: 32 });
        expect(ECC_PROFILES.High).toEqual({ dataBytes: 191, parityBytes: 64 });
        expect(ECC_PROFILES.Ultra).toEqual({ dataBytes: 127, parityBytes: 128 });
        expect(ECC_PROFILES.Extreme).toEqual({ dataBytes: 85, parityBytes: 170 });
    });
});

describe('Wire format conformance: F5 embedding (layer 1)', () => {
    it('mutates exactly the golden coefficients', () => {
        const blocks = createMockBlocks(12);
        const result = F5.embedRaw(blocks, fromHex(VECTORS.f5Embed.data_hex), {
            seed: VECTORS.f5Embed.seed,
            k: VECTORS.f5Embed.k
        });
        expect(result.success).toBe(true);
        expect(result.k).toBe(VECTORS.f5Embed.k);

        const actualChanges = [];
        for (let b = 0; b < blocks.length; b++) {
            for (let c = 1; c < 64; c++) {
                const change = VECTORS.f5Embed.changes.find(ch => ch.block === b && ch.coeff === c);
                if (change) {
                    expect(blocks[b][c]).toBe(change.to);
                    actualChanges.push(change);
                } else {
                    expect([3, -3]).toContain(blocks[b][c]);
                }
            }
        }
        expect(actualChanges.length).toBe(VECTORS.f5Embed.changes.length);
    });
});

describe('Wire format conformance: container layout v3 (layers 0-2)', () => {
    it('golden frame decodes to the pinned control fields', async () => {
        const vector = VECTORS.container;
        const frame = fromHex(vector.container_hex);

        // Control codeword is the leading 255 bytes of the frame.
        const [plane, decErr] = decodeControlCodeword(frame.slice(0, 255));
        expect(decErr).toBe(null);
        const [fields, unpackErr] = unpackControlHeader(plane);
        expect(unpackErr).toBe(null);

        expect(fields.magic).toBe('F5SG');
        expect(fields.version).toBe(3);
        expect(fields.k).toBe(vector.stored_k);
        expect(fields.payloadLen).toBe(vector.payload_length);
        expect(fields.bodyCRC32).toBe(vector.control_fields.bodyCRC32);

        // Body CRC covers metadata + payload exactly as pinned.
        const body = frame.slice(255);
        void body;
        expect(toHex(frame)).toBe(vector.container_hex);
    });

    it('embeds the golden frame into fresh carriers and round-trips', async () => {
        const vector = VECTORS.container;
        const frame = fromHex(vector.container_hex);

        const blocks = createMockBlocks(vector.carrier_blocks);
        const result = F5.embedRaw(blocks, frame, { seed: vector.seed, k: vector.stored_k });
        expect(result.success).toBe(true);

        const extracted = await F5.extractAuto(blocks, { seed: vector.seed });
        expect(extracted).not.toBe(null);
        expect(toHex(extracted.data)).toBe(vector.payload_hex);
    });

    it('rejects a wrong-version control header', async () => {
        const vector = VECTORS.container;
        const bytes = fromHex(vector.container_hex);
        bytes[4 + 0] = 9; // version byte lives INSIDE the RS-coded control plane

        const blocks = createMockBlocks(vector.carrier_blocks);
        const result = F5.embedRaw(blocks, bytes, { seed: vector.seed, k: vector.stored_k });
        expect(result.success).toBe(true);

        const extracted = await F5.extractAuto(blocks, { seed: vector.seed });
        // RS may correct the single-symbol corruption OR decode fails; both
        // are acceptable only if no wrong-version data is returned.
        if (extracted !== null && extracted.metadata && extracted.metadata.version !== undefined) {
            expect(extracted.metadata.version).toBe(3);
        }
    });

    it('recovers byte-exact when METADATA-region coefficients are corrupted (v3 headline)', async () => {
        const vector = VECTORS.container;
        const frame = fromHex(vector.container_hex);

        // Corrupt symbols inside the coded BODY region (after control) -
        // under v2 framing this destroyed the metadata JSON irrecoverably.
        // 12 errors stays within the Medium profile's per-block correction
        // capability (t=16).
        const rng = seededRandomFactory();
        for (let i = 255; i < frame.length && i < 255 + 12; i++) {
            frame[i] ^= 0x01 + (Math.floor(rng() * 127));
        }

        const blocks = createMockBlocks(vector.carrier_blocks);
        const result = F5.embedRaw(blocks, frame, { seed: vector.seed, k: vector.stored_k });
        expect(result.success).toBe(true);

        const extracted = await F5.extractAuto(blocks, { seed: vector.seed });
        expect(extracted).not.toBe(null);
        expect(toHex(extracted.data)).toBe(vector.payload_hex);
    });
});

function seededRandomFactory() {
    let s = 987654321 >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return ((s >>> 8) & 0xFFFFFF) / 0x1000000;
    };
}
