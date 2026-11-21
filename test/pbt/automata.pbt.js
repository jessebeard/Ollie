import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { BitWriter } from '../../src/automata/bit-streams/bit-writer.js';
import { BitReader } from '../../src/automata/bit-streams/bit-reader.js';
import { decodeOptimized } from '../../src/automata/entropy-coding/huffman-optimized-fsm.js';
import { HuffmanTable } from '../../src/automata/parsers/dht-automaton.js';

describe('Automata Dedicated PBT Suite', () => {
    it('Property: BitWriter <-> BitReader roundtrip preserves exact bit sequences across arbitrary byte lengths', async () => {
        await assertProperty(
            [Arbitrary.bitSequence(1, 120)],
            ({ bits, length }) => {
                const writer = new BitWriter();
                for (let i = 0; i < length; i++) {
                    writer.writeBit(bits[i]);
                }
                const buffer = writer.flush();

                const reader = new BitReader(buffer);
                const recovered = [];
                for (let i = 0; i < length; i++) {
                    recovered.push(reader.readBit());
                }

                expect(recovered).toEqual(bits);
            },
            60
        );
    });

    it('Property: BitWriter batch writeBits preserves identical bits to single writeBit calls across arbitrary bit widths', async () => {
        await assertProperty(
            [Arbitrary.array(Arbitrary.record({
                val: Arbitrary.integer(0, 0x7FFF),
                len: Arbitrary.integer(1, 15)
            }), 1, 30)],
            (chunks) => {
                const w1 = new BitWriter();
                const w2 = new BitWriter();

                for (const { val, len } of chunks) {
                    const masked = val & ((1 << len) - 1);
                    w1.writeBits(masked, len);
                    for (let i = len - 1; i >= 0; i--) {
                        w2.writeBit((masked >> i) & 1);
                    }
                }

                expect(Array.from(w1.flush())).toEqual(Array.from(w2.flush()));
            },
            50
        );
    });

    it('Property: Optimized 16-bit LUT Huffman decoder roundtrips arbitrary symbol sequences exactly', async () => {
        const bits = new Uint8Array([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
        const values = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        const table = new HuffmanTable(bits, values, 0, 0);

        // Build encoding map from canonical prefix codes
        const encoderMap = new Map();
        let code = 0;
        let symIdx = 0;
        for (let len = 1; len <= 16; len++) {
            const count = bits[len - 1];
            for (let i = 0; i < count; i++) {
                encoderMap.set(values[symIdx++], { code, len });
                code++;
            }
            code <<= 1;
        }

        await assertProperty(
            [Arbitrary.array(Arbitrary.integer(0, 11), 1, 25)],
            (symbols) => {
                const writer = new BitWriter();
                for (const sym of symbols) {
                    const { code: c, len } = encoderMap.get(sym);
                    writer.writeBits(c, len);
                }
                // Append extra padding bits so peek16Bits() does not underrun at EOF
                writer.writeBits(0, 16);
                const buffer = writer.flush();

                const reader = new BitReader(buffer);
                const recovered = [];
                for (let i = 0; i < symbols.length; i++) {
                    const [decodedSym, err] = decodeOptimized(table, reader);
                    expect(err).toBe(null);
                    recovered.push(decodedSym);
                }

                expect(recovered).toEqual(symbols);
            },
            50
        );
    });
});
