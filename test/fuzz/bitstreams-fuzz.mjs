/**
 * BitReader differential fuzz bodies (shared by the smoke test wrapper and
 * scripts/fuzz.mjs via test/fuzz/suites.mjs).
 */
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { BitReader } from '../../src/automata/bit-streams/bit-reader.js';
import * as core from '../../src/automata/bit-streams/bit-core.js';

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

function bitsToBytes(bits) {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    bits.forEach((bit, i) => { if (bit) bytes[i >> 3] |= (0x80 >> (i & 7)); });
    return bytes;
}

/** Legal JPEG-scan-like stream: every 0xFF is byte-stuffed with 0x00. */
function legalStuffedStream(n, rng) {
    const out = [];
    while (out.length < n) {
        const b = rng(1)[0];
        out.push(b);
        if (b === 0xFF) out.push(0x00);
    }
    while (out[out.length - 1] === 0xFF) {
        out.pop();
        if (out.length === 0) out.push(0x00);
    }
    return new Uint8Array(out);
}

function destuff(stream) {
    const out = [];
    for (let i = 0; i < stream.length; i++) {
        if (stream[i] === 0xFF && i + 1 < stream.length && stream[i + 1] === 0x00) {
            out.push(0xFF);
            i++;
        } else {
            out.push(stream[i]);
        }
    }
    return new Uint8Array(out);
}

async function propBitVsBlock(data) {
    const stream = legalStuffedStream(data.length + 4, seededRandom(data[0] + data.length));
    const expected = destuff(stream);
    const totalBits = expected.length * 8;

    const blockReader = new BitReader(stream);
    const blockBits = [];
    for (let i = totalBits; i > 0; i -= 8) {
        const v = blockReader.readBits(Math.min(8, i));
        for (let b = Math.min(8, i) - 1; b >= 0; b--) blockBits.push((v >> b) & 1);
    }

    const bitReader = new BitReader(stream);
    const bitBits = [];
    for (let i = 0; i < totalBits; i++) bitBits.push(bitReader.readBit() ? 1 : 0);

    if (bitsToBytes(blockBits).join() !== expected.join()) throw new Error('block read diverged');
    if (bitsToBytes(bitBits).join() !== expected.join()) throw new Error('bit reads diverged');
}

async function propWrapperTracksCore(data) {
    const stream = legalStuffedStream(data.length + 6, seededRandom(data[0] + data.length));
    const maxBits = stream.length * 8;
    const rng = seededRandom(stream[1] * 977 + stream[0]);

    const reader = new BitReader(stream);
    let cb = 0, cbi = 0;

    for (let step = 0; step < 14; step++) {
        const remaining = maxBits - (cb * 8 + cbi);
        if (remaining < 2) break;
        const len = 1 + (rng(1)[0] % Math.min(8, remaining));

        const wrapperVal = reader.readBits(len);
        const [coreVal, nb, nbi, err] = core.readBits(stream, cb, cbi, len);
        if (err) throw new Error(`core errored on legal stream: ${err.message}`);
        if (wrapperVal !== coreVal) throw new Error(`step ${step}: wrapper=${wrapperVal} core=${coreVal}`);
        cb = nb; cbi = nbi;

        if (reader.byteOffset !== cb || reader.bitOffset !== cbi) {
            throw new Error(`step ${step}: position divergence`);
        }
    }
}

async function propStuffedPositions(seedBytes) {
    const data = legalStuffedStream(seedBytes.length + 10, seededRandom(seedBytes[0] + seedBytes.length * 31));

    const rBlock = new BitReader(data);
    rBlock.readBits(Math.min(16, data.length * 8));

    const rParts = new BitReader(data);
    let taken = 0;
    while (taken < Math.min(16, data.length * 8)) {
        const take = Math.min(7, Math.min(16, data.length * 8) - taken);
        rParts.readBits(take);
        taken += take;
    }

    if (rBlock.byteOffset !== rParts.byteOffset || rBlock.bitOffset !== rParts.bitOffset) {
        throw new Error('stuffed stream positions diverged between read strategies');
    }
}

function pinMarkerSemantics() {
    const data = new Uint8Array([0xAB, 0xFF, 0xD8, 0x00]);
    const reader = new BitReader(data);
    reader.skipBits(8);
    try {
        reader.readBits(16);
    } catch (e) {
        if (!/marker/i.test(e.message)) throw new Error(`unexpected error class: ${e.message}`);
        return;
    }
    throw new Error('FF+nonzero must fail loudly as a marker collision');
}

/** Long-run entry point (scripts/fuzz.mjs registry). */
export async function runBitstreamsFuzz(scale = 1) {
    await assertProperty([Arbitrary.byteArray(2, 64)], propBitVsBlock, 30 * scale);
    await assertProperty([Arbitrary.byteArray(4, 48)], propWrapperTracksCore, 40 * scale);
    await assertProperty([Arbitrary.byteArray(4, 24)], propStuffedPositions, 30 * scale);
    pinMarkerSemantics();
}
