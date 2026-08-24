import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { F5 } from '../../src/information-theory/steganography/f5-syndrome.js';
import { ErrorCorrection, ECC_PROFILES } from '../../src/information-theory/error-correction/rs-interleaver.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { crc32 } from '../../src/utils/crc32.js';

const PROFILES = Object.keys(ECC_PROFILES);

/**
 * Uniform picker over a fixed value set. Routes through the harness's
 * (optionally seeded) random source via Arbitrary.integer.
 */
function oneOf(values) {
    return {
        generate: () => values[Arbitrary.integer(0, values.length - 1).generate()],
        shrink: (value) => {
            const idx = values.indexOf(value);
            return idx <= 0 ? [] : [values[0]];
        }
    };
}

/**
 * Integer strictly outside the forbidden window [lo, hi]. Draws from three
 * invalid regions: negatives, the below-window band [0, lo), and the
 * above-window band [hi+1, absMax].
 */
function integerOutside(lo, hi, absMax, negDepth = 1000) {
    return {
        generate: () => {
            const roll = Arbitrary.integer(0, 3).generate();
            if (roll === 0) return -Arbitrary.integer(1, negDepth).generate();
            if (roll === 1 && lo > 0) return Arbitrary.integer(0, lo).generate();
            return Arbitrary.integer(hi + 1, absMax).generate();
        },
        shrink: (value) => {
            const target = value <= 0 ? -1 : hi + 1;
            if (value === target) return [];
            return [target];
        }
    };
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

function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function buildContainerBytes(metaStr, payload, k) {
    const metaBytes = new TextEncoder().encode(metaStr);
    const totalSize = 17 + metaBytes.length + payload.length;
    const buf = new Uint8Array(totalSize);
    const view = new DataView(buf.buffer);
    let off = 0;

    buf.set(new TextEncoder().encode('F5SG'), off); off += 4;
    view.setUint8(off, 2); off += 1;
    view.setUint8(off, 0); off += 1;
    view.setUint8(off, k); off += 1;
    view.setUint16(off, metaBytes.length, false); off += 2;
    buf.set(metaBytes, off); off += metaBytes.length;
    view.setUint32(off, payload.length, false); off += 4;
    buf.set(payload, off); off += payload.length;
    view.setUint32(off, crc32(buf.subarray(0, off)), false);
    return buf;
}

// Fixed reference payload: 250 bytes -> Medium blockCount 2, encoded length 510.
const FORGED_ECC_INPUT = new Uint8Array(250);
for (let i = 0; i < FORGED_ECC_INPUT.length; i++) FORGED_ECC_INPUT[i] = (i * 13 + 5) & 0xFF;

describe('ECC framing (Property-Based Tests)', () => {

    it('Property: protect/recover roundtrip is byte-exact for every profile', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 600), oneOf(PROFILES)],
            (data, profileName) => {
                const [result, err] = ErrorCorrection.protect(data, profileName);
                if (err) throw new Error(`protect failed: ${err.message}`);
                const [recovered, recoverErr] = ErrorCorrection.recover(
                    result.encoded, profileName, result.originalLength, result.blockCount
                );
                if (recoverErr) throw new Error(`recover failed: ${recoverErr.message}`);
                if (!bytesEqual(recovered, data)) throw new Error('roundtrip mismatch');
            },
            60
        );
    });

    it('Property: any single corrupted byte in an interleaved payload recovers byte-exact', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 400), oneOf(PROFILES), Arbitrary.integer(0, 100000)],
            (data, profileName, rawPos) => {
                const [result, err] = ErrorCorrection.protect(data, profileName);
                if (err) throw new Error(`protect failed: ${err.message}`);

                const corrupted = Uint8Array.from(result.encoded);
                const pos = rawPos % corrupted.length;
                corrupted[pos] ^= 0xFF;

                const [recovered, recoverErr] = ErrorCorrection.recover(
                    corrupted, profileName, result.originalLength, result.blockCount
                );
                if (recoverErr) throw new Error(`single-flip at ${pos} not corrected: ${recoverErr.message}`);
                if (!bytesEqual(recovered, data)) throw new Error(`single-flip at ${pos} mis-recovered`);
            },
            60
        );
    });

    it('Property: deinterleave inverts interleave', async () => {
        await assertProperty(
            [Arbitrary.integer(1, 11)],
            (blockCount) => {
                const blockSize = 255;
                const blocks = [];
                for (let b = 0; b < blockCount; b++) {
                    const block = new Int32Array(blockSize);
                    for (let j = 0; j < blockSize; j++) {
                        block[j] = (b * 67 + j * 13 + 5) & 0xFF;
                    }
                    blocks.push(block);
                }

                const interleaved = ErrorCorrection._interleave(blocks, blockCount, blockSize);
                if (interleaved.length !== blockCount * blockSize) {
                    throw new Error('interleave produced wrong size');
                }

                const roundtrip = ErrorCorrection._deinterleave(interleaved, blockCount, blockSize);
                for (let b = 0; b < blockCount; b++) {
                    for (let j = 0; j < blockSize; j++) {
                        if (roundtrip[b][j] !== blocks[b][j]) {
                            throw new Error(`interleave identity broken at block ${b} byte ${j}`);
                        }
                    }
                }
            },
            40
        );
    });

    it('Property: forged blockCount values always fail closed', async () => {
        const [reference, refErr] = ErrorCorrection.protect(FORGED_ECC_INPUT, 'Medium');
        if (refErr) throw refErr;

        await assertProperty(
            [integerOutside(1, 2, 400)],
            (badBlockCount) => {
                const [recovered, err] = ErrorCorrection.recover(
                    reference.encoded, 'Medium', 250, badBlockCount
                );
                if (!(err instanceof Error)) {
                    throw new Error(`accepted forged blockCount ${badBlockCount}`);
                }
                if (recovered !== null) throw new Error('returned a buffer alongside an error');
            },
            50
        );
    });

    it('Property: forged originalLength values always fail closed', async () => {
        const [reference, refErr] = ErrorCorrection.protect(FORGED_ECC_INPUT, 'Medium');
        if (refErr) throw refErr;

        await assertProperty(
            [integerOutside(0, 446, 100000)],
            (badLength) => {
                const [recovered, err] = ErrorCorrection.recover(
                    reference.encoded, 'Medium', badLength, 2
                );
                if (!(err instanceof Error)) {
                    throw new Error(`accepted forged originalLength ${badLength}`);
                }
                if (recovered !== null) throw new Error('returned a buffer alongside an error');
            },
            50
        );
    });
});

describe('F5 embedding (Property-Based Tests)', () => {

    it('Property: extractRaw inverts embedRaw for any seed/k/data within capacity', async () => {
        // 60 mock blocks -> 3780 usable AC coefficients; data bounded so even
        // k=4 (the most coefficient-hungry mode) always fits.
        await assertProperty(
            [Arbitrary.byteArray(1, 124), oneOf([1, 2, 3, 4]), Arbitrary.string(1, 32)],
            (data, k, seed) => {
                const blocks = createMockBlocks(60);
                const result = F5.embedRaw(blocks, data, { seed, k });
                if (!result.success) throw new Error('embed failed despite guaranteed capacity');

                const out = F5.extractRaw(blocks, data.length * 8, { seed, k });
                if (!out) throw new Error('extraction returned null');
                if (!bytesEqual(out, data)) throw new Error('extracted bytes differ');
            },
            40
        );
    });

    it('Property: permutation is a pure bijection of 0..N-1', async () => {
        await assertProperty(
            [Arbitrary.integer(63, 505), Arbitrary.string(1, 24)],
            (n, seed) => {
                const p1 = Array.from(F5.generatePermutation(n, seed));
                const p2 = Array.from(F5.generatePermutation(n, seed));
                if (p1.join(',') !== p2.join(',')) throw new Error('permutation not deterministic');

                const seen = new Uint8Array(n);
                for (const v of p1) {
                    if (v < 0 || v >= n) throw new Error(`out-of-range index ${v}`);
                    if (seen[v]) throw new Error(`duplicate index ${v}`);
                    seen[v] = 1;
                }
            },
            50
        );
    });
});

describe('Container framing v2 (Property-Based Tests)', () => {

    it('Property: embedContainer/extractAuto roundtrip with metadata echo', async () => {
        await assertProperty(
            [
                Arbitrary.byteArray(1, 56),
                Arbitrary.boolean(),
                oneOf(PROFILES),
                Arbitrary.string(1, 24),
                Arbitrary.integer(110, 141)
            ],
            async (payload, useEcc, profileName, seed, blockCount) => {
                const blocks = createMockBlocks(blockCount);
                const metadata = useEcc ? { ecc: true, eccProfile: profileName } : {};

                const [ok, embedErr] = await F5.embedContainer(blocks, payload, metadata, { seed });
                if (!ok) throw new Error(`embed failed: ${embedErr && embedErr.message}`);

                const extracted = await F5.extractAuto(blocks, { seed });
                if (!extracted) throw new Error('extraction returned null');
                if (!bytesEqual(extracted.data, payload)) throw new Error('payload mismatch');

                if (useEcc) {
                    if (extracted.metadata.eccProfile !== 'Extreme') {
                        throw new Error(`expected Extreme, got ${extracted.metadata.eccProfile}`);
                    }
                    // v3: blockCount describes BODY geometry
                    if (extracted.metadata.blockCount === undefined) {
                        throw new Error('blockCount missing');
                    }
                }
            },
            40
        );
    });

    it('Property: any single-byte container corruption is rejected when ECC is off', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 120), Arbitrary.integer(0, 100000)],
            async (payload, rawPos) => {
                const container = buildContainerBytes('{}', payload, 2);

                const pos = rawPos % container.length;
                container[pos] ^= 0xFF;

                const blocks = createMockBlocks(40);
                const result = F5.embedRaw(blocks, container, { seed: 'pbt-tamper', k: 2 });
                if (!result.success) throw new Error('setup embed failed');

                const extracted = await F5.extractAuto(blocks, { seed: 'pbt-tamper' });
                if (extracted !== null) {
                    throw new Error(`corruption at byte ${pos} was accepted`);
                }
            },
            40
        );
    });

    it('Property: KDF iteration counts outside [50000, 10000000] are rejected fast', async () => {
        await assertProperty(
            [integerOutside(50000, 10000000, 2147483000)],
            async (iterations) => {
                const metaStr = JSON.stringify({
                    encrypted: true,
                    enc: { kdf: 'PBKDF2-SHA256', iterations }
                });
                const container = buildContainerBytes(metaStr, new TextEncoder().encode('vault-bytes'), 2);

                const blocks = createMockBlocks(40);
                const result = F5.embedRaw(blocks, container, { seed: 'pbt-kdf', k: 2 });
                if (!result.success) throw new Error('setup embed failed');

                const started = Date.now();
                const extracted = await F5.extractAuto(blocks, { seed: 'pbt-kdf' });
                const elapsed = Date.now() - started;

                if (extracted !== null) throw new Error(`accepted iterations=${iterations}`);
                if (elapsed >= 4000) throw new Error('rejection was slow; PBKDF2 ran before validation');
            },
            40
        );
    });
});

describe('Chunk framing (Property-Based Tests)', () => {

    it('Property: reassemble(split(data)) restores the input for any chunking', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 2049), Arbitrary.integer(1, 2100)],
            (data, chunkSize) => {
                const chunks = ChunkManager.split(data, chunkSize, 'pbt-chunk-id');
                const expectedTotal = Math.ceil(data.length / chunkSize);
                if (chunks.length !== expectedTotal) {
                    throw new Error(`expected ${expectedTotal} chunks, got ${chunks.length}`);
                }

                const [reassembled, err] = ChunkManager.reassemble(chunks);
                if (err) throw new Error(`reassemble failed: ${err.message}`);
                if (!bytesEqual(reassembled, data)) throw new Error('reassembled bytes differ');
            },
            60
        );
    });

    it('Property: any single-byte chunk mutation trips the integrity checksum', async () => {
        await assertProperty(
            [Arbitrary.byteArray(2, 900), Arbitrary.integer(0, 100000)],
            (data, rawPos) => {
                const chunkSize = Math.ceil(data.length / 3);
                const chunks = ChunkManager.split(data, chunkSize, 'pbt-integrity-id');

                const pos = rawPos % data.length;
                const chunkIdx = Math.floor(pos / chunkSize);
                const victim = chunks[chunkIdx];
                const localPos = pos % victim.data.length;
                const mutatedData = Uint8Array.from(victim.data);
                mutatedData[localPos] ^= 0xFF;

                const mutatedChunks = chunks.map((c, i) => i === chunkIdx
                    ? { ...c, data: mutatedData }
                    : c);

                const [reassembled, err] = ChunkManager.reassemble(mutatedChunks);
                if (!(err instanceof Error)) {
                    throw new Error(`mutation at byte ${pos} was accepted`);
                }
                if (!err.message.includes('Checksum')) throw new Error(`unexpected error: ${err.message}`);
                if (reassembled !== null) throw new Error('returned a buffer alongside an error');
            },
            60
        );
    });
});
