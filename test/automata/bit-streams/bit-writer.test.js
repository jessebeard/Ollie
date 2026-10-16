import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { BitWriter } from '../../../src/automata/bit-streams/bit-writer.js';
import { BitReader } from '../../../src/automata/bit-streams/bit-reader.js';

describe('BitWriter (Bitstream Packing & Byte Stuffing)', () => {
    it('writes individual bits correctly up to full bytes', () => {
        const writer = new BitWriter();
        // Write 0b10110010 (0xB2)
        const bits = [1, 0, 1, 1, 0, 0, 1, 0];
        for (const b of bits) {
            writer.writeBit(b);
        }
        const out = writer.flush();
        expect(out.length).toBe(1);
        expect(out[0]).toBe(0xB2);
    });

    it('writes multi-bit values via writeBits matching bit-by-bit writeBit', () => {
        const w1 = new BitWriter();
        w1.writeBits(0b1101, 4);
        w1.writeBits(0b1010, 4);

        const w2 = new BitWriter();
        const bits = [1, 1, 0, 1, 1, 0, 1, 0];
        for (const b of bits) w2.writeBit(b);

        expect(Array.from(w1.flush())).toEqual(Array.from(w2.flush()));
        expect(w1.flush()[0]).toBe(0xDA);
    });

    it('stuffs 0x00 immediately after any 0xFF byte emission', () => {
        const writer = new BitWriter();
        // Write 8 ones (0xFF)
        writer.writeBits(0xFF, 8);
        const out = writer.flush();
        // Byte stuffing: 0xFF must be followed by 0x00
        expect(out.length).toBe(2);
        expect(out[0]).toBe(0xFF);
        expect(out[1]).toBe(0x00);
    });

    it('alignByte pads remaining bits in partial byte with 1s', () => {
        const writer = new BitWriter();
        // Write 3 bits: 0b100
        writer.writeBits(0b100, 3);
        // alignByte pads remaining 5 bits with 1s: 0b100_11111 = 0x9F
        writer.alignByte();
        const out = writer.flush();
        expect(out.length).toBe(1);
        expect(out[0]).toBe(0x9F);
    });

    it('writeMarker aligns and emits un-stuffed 2-byte marker', () => {
        const writer = new BitWriter();
        writer.writeBits(0b101, 3); // Unaligned
        writer.writeMarker(0xFFDA); // SOS marker
        const out = writer.flush();

        // First byte: padded 0b101_11111 = 0xBF
        // Next bytes: 0xFF, 0xDA (un-stuffed)
        expect(out.length).toBe(3);
        expect(out[0]).toBe(0xBF);
        expect(out[1]).toBe(0xFF);
        expect(out[2]).toBe(0xDA);
    });

    it('writeRawByte emits raw aligned byte', () => {
        const writer = new BitWriter();
        writer.writeRawByte(0x42);
        const out = writer.flush();
        expect(out.length).toBe(1);
        expect(out[0]).toBe(0x42);
    });

    describe('PBT & Differential Properties', () => {
        it('Property: batch writeBits produces bit-identical output to individual writeBit calls', async () => {
            await assertProperty(
                [Arbitrary.byteArray(1, 64)],
                (bytes) => {
                    const wBatch = new BitWriter();
                    const wSingle = new BitWriter();

                    for (const b of bytes) {
                        wBatch.writeBits(b, 8);
                        for (let i = 7; i >= 0; i--) {
                            wSingle.writeBit((b >> i) & 1);
                        }
                    }

                    const outBatch = wBatch.flush();
                    const outSingle = wSingle.flush();
                    expect(Array.from(outBatch)).toEqual(Array.from(outSingle));
                },
                50
            );
        });

        it('Property: BitReader(BitWriter(bits)) roundtrip bijection across arbitrary bitstreams', async () => {
            await assertProperty(
                [Arbitrary.byteArray(1, 64)],
                (randomBytes) => {
                    // Collect arbitrary bit sequence
                    const bits = [];
                    for (const byte of randomBytes) {
                        for (let i = 7; i >= 0; i--) {
                            bits.push((byte >> i) & 1);
                        }
                    }

                    const writer = new BitWriter();
                    for (const bit of bits) {
                        writer.writeBit(bit);
                    }
                    const encoded = writer.flush();

                    // Read back exactly bits.length bits via BitReader
                    const reader = new BitReader(encoded);
                    const recoveredBits = [];
                    for (let i = 0; i < bits.length; i++) {
                        recoveredBits.push(reader.readBit());
                    }

                    expect(recoveredBits).toEqual(bits);
                },
                50
            );
        });

        it('Property: byte-stuffing roundtrip preserves byte sequences containing 0xFF', async () => {
            await assertProperty(
                [Arbitrary.byteArray(1, 32)],
                (bytes) => {
                    // Intentionally inject 0xFF bytes
                    const streamWith0xFF = new Uint8Array(bytes.length + 3);
                    streamWith0xFF.set(bytes);
                    streamWith0xFF[0] = 0xFF;
                    if (bytes.length > 5) streamWith0xFF[5] = 0xFF;
                    streamWith0xFF[streamWith0xFF.length - 1] = 0xFF;

                    const writer = new BitWriter();
                    for (const b of streamWith0xFF) {
                        writer.writeBits(b, 8);
                    }
                    const encoded = writer.flush();

                    // Reader must unstuff all 0xFF 0x00 pairs seamlessly
                    const reader = new BitReader(encoded);
                    const recoveredBytes = new Uint8Array(streamWith0xFF.length);
                    for (let i = 0; i < streamWith0xFF.length; i++) {
                        recoveredBytes[i] = reader.readBits(8);
                    }

                    expect(Array.from(recoveredBytes)).toEqual(Array.from(streamWith0xFF));
                },
                50
            );
        });
    });
});
