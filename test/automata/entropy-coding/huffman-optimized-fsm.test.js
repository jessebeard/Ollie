import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { buildOptimizedLookup, decodeOptimized } from '../../../src/automata/entropy-coding/huffman-optimized-fsm.js';
import { HuffmanTable } from '../../../src/automata/parsers/dht-automaton.js';
import { BitReader } from '../../../src/automata/bit-streams/bit-reader.js';
import { BitWriter } from '../../../src/automata/bit-streams/bit-writer.js';

describe('Optimized Huffman FSM (16-bit LUT Decoder)', () => {
    // Standard JPEG Luminance DC Table specification (ITU-T T.81 Annex K.3)
    const stdDcBits = new Uint8Array([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    const stdDcValues = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    it('builds a 65536-entry lookup table and sets maxCodeLength', () => {
        const table = new HuffmanTable(stdDcBits, stdDcValues, 0, 0);
        buildOptimizedLookup(table);

        expect(table.fastLookup instanceof Uint16Array).toBe(true);
        expect(table.fastLookup.length).toBe(65536);
        expect(table.maxCodeLength).toBe(9);
    });

    it('decodes known symbols and advances BitReader by exact bit length', () => {
        const table = new HuffmanTable(stdDcBits, stdDcValues, 0, 0);

        // In standard luminance DC table:
        // bitlength 2, count 1 -> code 0b00 corresponds to symbol 0.
        const writer = new BitWriter();
        writer.writeBits(0b00, 2);
        writer.flush();

        const reader = new BitReader(writer.flush());
        const [symbol, err] = decodeOptimized(table, reader);

        expect(err).toBe(null);
        expect(symbol).toBe(0);
        expect(reader.bitOffset).toBe(2);
    });

    it('returns typed error for invalid/unassigned Huffman code prefixes', () => {
        // Build a minimal table with only 1 code of length 1 (code 0b0 -> symbol 42)
        const bits = new Uint8Array(16);
        bits[0] = 1;
        const values = new Uint8Array([42]);
        const table = new HuffmanTable(bits, values, 0, 0);

        // Code starting with 0b1 has no entry
        const writer = new BitWriter();
        writer.writeBits(0b11111111, 8);
        const reader = new BitReader(writer.flush());

        const [symbol, err] = decodeOptimized(table, reader);
        expect(symbol).toBe(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message).toContain('Invalid Huffman code');
    });

    it('Differential: decodes every symbol in standard luminance DC table correctly', () => {
        const table = new HuffmanTable(stdDcBits, stdDcValues, 0, 0);

        // Reconstruct canonical codes per JPEG spec F.1.2.2.1
        let code = 0;
        let symbolIdx = 0;

        for (let len = 1; len <= 16; len++) {
            const count = stdDcBits[len - 1];
            for (let i = 0; i < count; i++) {
                const expectedSymbol = stdDcValues[symbolIdx];

                // Write the code to a BitWriter
                const writer = new BitWriter();
                writer.writeBits(code, len);
                const stream = writer.flush();

                const reader = new BitReader(stream);
                const [decoded, err] = decodeOptimized(table, reader);

                expect(err).toBe(null);
                expect(decoded).toBe(expectedSymbol);
                expect(reader.bitOffset).toBe(len % 8);

                code++;
                symbolIdx++;
            }
            code <<= 1;
        }
    });

    describe('PBT & Robustness', () => {
        it('Property: decodeOptimized never throws on arbitrary random byte sequences', async () => {
            const table = new HuffmanTable(stdDcBits, stdDcValues, 0, 0);

            await assertProperty(
                [Arbitrary.byteArray(2, 32)],
                (bytes) => {
                    const reader = new BitReader(bytes);
                    const [symbol, err] = decodeOptimized(table, reader);

                    if (err) {
                        expect(err instanceof Error).toBe(true);
                        expect(symbol).toBe(null);
                    } else {
                        expect(typeof symbol).toBe('number');
                        expect(symbol >= 0 && symbol <= 11).toBe(true);
                    }
                },
                50
            );
        });

        it('Property: all table entries have valid symbol and length <= maxCodeLength', () => {
            const table = new HuffmanTable(stdDcBits, stdDcValues, 0, 0);

            for (let i = 0; i < 65536; i++) {
                const entry = table.fastLookup[i];
                const len = entry >> 8;
                const sym = entry & 0xFF;

                if (len > 0) {
                    expect(len <= table.maxCodeLength).toBe(true);
                    expect(sym >= 0 && sym <= 11).toBe(true);
                } else {
                    expect(entry).toBe(0);
                }
            }
        });
    });
});
