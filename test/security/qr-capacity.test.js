import { describe, it, expect } from '../utils/test-runner.js';
// RED: module does not exist yet - this suite must fail until C1 GREEN.
import {
    MAX_VERSION,
    symbolSize,
    ecMBlocks,
    ecMParity,
    totalCodewords,
    dataCodewords,
    alignmentCenters,
    formatInfoBits,
    versionInfoBits,
    EC_LEVEL_BITS,
    FORMAT_MASK
} from '../../src/codec/qr-capacity.js';

/**
 * Known-answer tests for the shared ISO/IEC 18004 capacity tables.
 * Golden values cross-checked against an independent ISO-conformant
 * implementation (python-qrcode lineage) covering versions 1-15 at
 * error-correction level M - sufficient for otpauth:// TOTP payloads.
 */

const GOLDEN_TOTALS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655];
const GOLDEN_EC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];
const GOLDEN_BLOCK_COUNTS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];

describe('QR capacity table: ISO/IEC 18004 golden values', () => {
    it('exposes MAX_VERSION=15', () => {
        expect(MAX_VERSION).toEqual(15);
    });

    it('maps every version to size = 17 + 4*version', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            expect(symbolSize(v)).toEqual(17 + 4 * v);
        }
    });

    it('matches golden EC-M total codeword counts for v1-v15', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            expect(totalCodewords(v)).toBe(GOLDEN_TOTALS[v - 1]);
        }
    });

    it('matches golden EC-M parity codewords per block for v1-v15', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            expect(ecMParity(v)).toBe(GOLDEN_EC_PER_BLOCK[v - 1]);
        }
    });

    it('block structures sum to golden totals and block counts', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const blocks = ecMBlocks(v);
            const countSum = blocks.reduce((a, b) => a + b.count, 0);
            const total = blocks.reduce((a, b) => a + b.count * b.data, 0) +
                          countSum * ecMParity(v);
            expect(countSum).toBe(GOLDEN_BLOCK_COUNTS[v - 1]);
            expect(total).toBe(GOLDEN_TOTALS[v - 1]);
        }
    });

    it('lists blocks shorter-first within each version', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const blocks = ecMBlocks(v);
            for (let i = 1; i < blocks.length; i++) {
                expect(blocks[i].data >= blocks[i - 1].data).toBe(true);
            }
        }
    });

    it('data codewords equal totals minus all parity', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const expectData = GOLDEN_TOTALS[v - 1] - GOLDEN_EC_PER_BLOCK[v - 1] * GOLDEN_BLOCK_COUNTS[v - 1];
            expect(dataCodewords(v)).toBe(expectData);
        }
    });

    it('spot-checks golden multi-block structures', () => {
        // ISO Table 13-27 spot checks (EC level M)
        const spot = [
            [4, [{ count: 2, data: 32 }]],
            [6, [{ count: 4, data: 27 }]],
            [9, [{ count: 3, data: 36 }, { count: 2, data: 37 }]],
            [10, [{ count: 4, data: 43 }, { count: 1, data: 44 }]],
            [11, [{ count: 1, data: 50 }, { count: 4, data: 51 }]],
            [12, [{ count: 6, data: 36 }, { count: 2, data: 37 }]],
            [14, [{ count: 4, data: 40 }, { count: 5, data: 41 }]],
            [15, [{ count: 5, data: 41 }, { count: 5, data: 42 }]]
        ];
        for (const [v, want] of spot) {
            const got = ecMBlocks(v);
            expect(got).toEqual(want);
        }
    });

    it('returns golden alignment-pattern center coordinates', () => {
        // ISO/IEC 18004 Annex E Table E.1 rows
        const centers = [
            [2, [6, 18]], [3, [6, 22]], [7, [6, 22, 38]], [8, [6, 24, 42]],
            [11, [6, 30, 54]], [14, [6, 26, 46, 66]], [15, [6, 26, 48, 70]]
        ];
        for (const [v, want] of centers) {
            expect(alignmentCenters(v)).toEqual(want);
        }
        expect(alignmentCenters(1)).toEqual([]);
    });
});

describe('QR format/version information KATs', () => {
    it('uses FORMAT_MASK 0x5412 per spec', () => {
        expect(FORMAT_MASK).toEqual(0x5412);
    });

    it('EC level bit codes are L=1 M=0 Q=3 H=2', () => {
        expect(EC_LEVEL_BITS.L).toEqual(1);
        expect(EC_LEVEL_BITS.M).toEqual(0);
        expect(EC_LEVEL_BITS.Q).toEqual(3);
        expect(EC_LEVEL_BITS.H).toEqual(2);
    });

    it('produces golden 15-bit format strings for EC-M masks 0-7', () => {
        const golden = [21522, 20773, 24188, 23371, 17913, 16590, 20375, 19104];
        for (let mask = 0; mask < 8; mask++) {
            expect(formatInfoBits(EC_LEVEL_BITS.M, mask)).toBe(golden[mask]);
        }
    });

    it('produces golden format strings for other EC levels at mask 0', () => {
        // low=30660 medium=21522 quartile=13663 high=5769
        expect(formatInfoBits(EC_LEVEL_BITS.L, 0)).toEqual(30660);
        expect(formatInfoBits(EC_LEVEL_BITS.Q, 0)).toEqual(13663);
        expect(formatInfoBits(EC_LEVEL_BITS.H, 0)).toEqual(5769);
    });

    it('produces golden 18-bit version information strings', () => {
        expect(versionInfoBits(7)).toEqual(31892);
        expect(versionInfoBits(8)).toEqual(34236);
        expect(versionInfoBits(11)).toEqual(48118);
    });

    it('rejects out-of-range versions in helpers', () => {
        for (const fn of [symbolSize, ecMBlocks, ecMParity, totalCodewords, dataCodewords, alignmentCenters]) {
            expect(() => fn(0)).toThrow();
            expect(() => fn(MAX_VERSION + 1)).toThrow();
        }
    });

    it('versionInfoBits rejects versions below 7', () => {
        expect(() => versionInfoBits(6)).toThrow();
    });

    describe('PBT & Monotonicity Properties', () => {
        it('Property: data and total codeword capacities are strictly monotonic with version', () => {
            for (let v = 1; v < MAX_VERSION; v++) {
                expect(dataCodewords(v + 1)).toBeGreaterThan(dataCodewords(v));
                expect(totalCodewords(v + 1)).toBeGreaterThan(totalCodewords(v));
            }
        });

        it('Property: alignment pattern coordinates are strictly bounded within symbol dimensions', () => {
            for (let v = 1; v <= MAX_VERSION; v++) {
                const size = symbolSize(v);
                const centers = alignmentCenters(v);
                for (const coord of centers) {
                    expect(coord).toBeGreaterThanOrEqual(6);
                    expect(coord).toBeLessThan(size - 6);
                }
            }
        });

        it('Property: format info bits always fit within 15 bits', () => {
            for (const level of Object.values(EC_LEVEL_BITS)) {
                for (let mask = 0; mask < 8; mask++) {
                    const bits = formatInfoBits(level, mask);
                    expect(bits).toBeGreaterThanOrEqual(0);
                    expect(bits).toBeLessThan(1 << 15);
                }
            }
        });
    });
});
