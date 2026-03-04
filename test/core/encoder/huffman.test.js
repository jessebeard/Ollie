import { describe, it, expect } from '../../utils/test-runner.js';
import { BitWriter } from '../../../src/utils/bit-writer.js';
import { computeCategory, getBitRepresentation, encodeBlock, DC_LUMA_TABLE, AC_LUMA_TABLE } from '../../../src/core/encoder/huffman.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';

describe('Huffman Coding', () => {
    describe('computeCategory', () => {
        it('category of 0 is 0', () => {
            expect(computeCategory(0)).toBe(0);
        });

        it('categories for small values', () => {
            expect(computeCategory(1)).toBe(1);
            expect(computeCategory(-1)).toBe(1);
            expect(computeCategory(2)).toBe(2);
            expect(computeCategory(-3)).toBe(2);
            expect(computeCategory(4)).toBe(3);
            expect(computeCategory(-7)).toBe(3);
        });

        it('categories for large values', () => {
            expect(computeCategory(255)).toBe(8);
            expect(computeCategory(1023)).toBe(10);
            expect(computeCategory(32767)).toBe(15);
            expect(computeCategory(-32768)).toBe(16);
        });

        it('Property: category increases with magnitude', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 32767)],
                (val) => {
                    const cat = computeCategory(val);
                    const doubleCat = computeCategory(val * 2);
                    // Doubling should increase or maintain category
                    return doubleCat >= cat;
                },
                50
            );
        });

        it('Property: positive and negative same magnitude have same category', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 32767)],
                (val) => {
                    return computeCategory(val) === computeCategory(-val);
                },
                50
            );
        });
    });

    describe('getBitRepresentation', () => {
        it('positive values return themselves', () => {
            expect(getBitRepresentation(1)).toBe(1);
            expect(getBitRepresentation(5)).toBe(5);
            expect(getBitRepresentation(100)).toBe(100);
        });

        it('negative values use ones complement encoding', () => {
            // For -1: category=1, return -1 + (1<<1) - 1 = -1 + 1 = 0
            expect(getBitRepresentation(-1)).toBe(0);
            // For -2: category=2, return -2 + (1<<2) - 1 = -2 + 3 = 1
            expect(getBitRepresentation(-2)).toBe(1);
            // For -3: category=2, return -3 + (1<<2) - 1 = -3 + 3 = 0
            expect(getBitRepresentation(-3)).toBe(0);
        });

        it('Property: bit representation fits in category bits', async () => {
            await assertProperty(
                [Arbitrary.integer(-2047, 2047)],
                (val) => {
                    if (val === 0) return true;
                    const cat = computeCategory(val);
                    const bits = getBitRepresentation(val);
                    // Result should fit in `cat` bits: 0 <= bits < (1 << cat)
                    return bits >= 0 && bits < (1 << cat);
                },
                100
            );
        });
    });

    describe('Standard Tables', () => {
        it('DC_LUMA_TABLE has entries for categories 0-11', () => {
            for (let i = 0; i <= 11; i++) {
                expect(DC_LUMA_TABLE[i]).toBeDefined();
                expect(DC_LUMA_TABLE[i].code).toBeDefined();
                expect(DC_LUMA_TABLE[i].length).toBeDefined();
                expect(DC_LUMA_TABLE[i].length).toBeGreaterThan(0);
            }
        });

        it('AC_LUMA_TABLE has EOB (0x00) entry', () => {
            expect(AC_LUMA_TABLE[0x00]).toBeDefined();
            expect(AC_LUMA_TABLE[0x00].length).toBeGreaterThan(0);
        });

        it('AC_LUMA_TABLE has ZRL (0xF0) entry', () => {
            expect(AC_LUMA_TABLE[0xF0]).toBeDefined();
            expect(AC_LUMA_TABLE[0xF0].length).toBeGreaterThan(0);
        });
    });

    describe('BitWriter integration', () => {
        it('writes bits correctly', () => {
            const writer = new BitWriter();
            writer.writeBits(0b101, 3);
            writer.writeBits(0b11, 2);

            const bytes = writer.flush();
            expect(bytes.length).toBe(1);
            expect(bytes[0]).toBe(0xBF);
        });

        it('performs byte stuffing (0xFF -> 0xFF 0x00)', () => {
            const writer = new BitWriter();
            writer.writeBits(0xFF, 8);
            const bytes = writer.flush();

            expect(bytes.length).toBe(2);
            expect(bytes[0]).toBe(0xFF);
            expect(bytes[1]).toBe(0x00);
        });

        it('expands buffer dynamically', () => {
            const writer = new BitWriter(1);
            for (let i = 0; i < 100; i++) {
                writer.writeBits(0xAA, 8);
            }
            const bytes = writer.flush();
            expect(bytes.length).toBe(100);
        });
    });

    describe('encodeBlock', () => {
        it('encodes a DC-only block (all AC = 0)', () => {
            const writer = new BitWriter();
            const block = new Int32Array(64);
            block[0] = 8;  // DC = 8, diff from 0 = 8, category 4

            const [dc, err] = encodeBlock(block, 0, writer);
            expect(err).toEqual(null);
            expect(dc).toBe(8);

            const bytes = writer.flush();
            expect(bytes.length).toBeGreaterThan(0);
        });

        it('encodes a block with AC coefficients', () => {
            const writer = new BitWriter();
            const block = new Int32Array(64);
            block[0] = 10; // DC
            block[1] = 5;  // First AC

            const [dc, err] = encodeBlock(block, 0, writer);
            expect(err).toEqual(null);
            expect(dc).toBe(10);

            const bytes = writer.flush();
            expect(bytes.length).toBeGreaterThan(0);
        });

        it('tracks DC differential correctly', () => {
            const writer = new BitWriter();
            const block1 = new Int32Array(64);
            block1[0] = 100;

            const [dc1, e1] = encodeBlock(block1, 0, writer);
            expect(e1).toEqual(null);
            expect(dc1).toBe(100);

            const block2 = new Int32Array(64);
            block2[0] = 110;

            const [dc2, e2] = encodeBlock(block2, dc1, writer);
            expect(e2).toEqual(null);
            expect(dc2).toBe(110);
        });

        it('handles all-zero block', () => {
            const writer = new BitWriter();
            const block = new Int32Array(64);

            const [dc, err] = encodeBlock(block, 0, writer);
            expect(err).toEqual(null);
            expect(dc).toBe(0);

            const bytes = writer.flush();
            expect(bytes.length).toBeGreaterThan(0);
        });

        it('Property: encodeBlock always returns DC value from block[0]', async () => {
            await assertProperty(
                [Arbitrary.integer(-1000, 1000)],
                (dcVal) => {
                    const writer = new BitWriter();
                    const block = new Int32Array(64);
                    block[0] = dcVal;

                    const [dc, err] = encodeBlock(block, 0, writer);
                    if (err) return false;
                    return dc === dcVal;
                },
                50
            );
        });
    });
});
