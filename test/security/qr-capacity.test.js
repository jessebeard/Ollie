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
            if (totalCodewords(v) !== GOLDEN_TOTALS[v - 1]) {
                throw new Error(`v${v}: total ${totalCodewords(v)} != golden ${GOLDEN_TOTALS[v - 1]}`);
            }
        }
    });

    it('matches golden EC-M parity codewords per block for v1-v15', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            if (ecMParity(v) !== GOLDEN_EC_PER_BLOCK[v - 1]) {
                throw new Error(`v${v}: ec/block ${ecMParity(v)} != golden ${GOLDEN_EC_PER_BLOCK[v - 1]}`);
            }
        }
    });

    it('block structures sum to golden totals and block counts', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const blocks = ecMBlocks(v);
            const countSum = blocks.reduce((a, b) => a + b.count, 0);
            const total = blocks.reduce((a, b) => a + b.count * b.data, 0) +
                          countSum * ecMParity(v);
            if (countSum !== GOLDEN_BLOCK_COUNTS[v - 1]) {
                throw new Error(`v${v}: block count ${countSum} != golden ${GOLDEN_BLOCK_COUNTS[v - 1]}`);
            }
            if (total !== GOLDEN_TOTALS[v - 1]) {
                throw new Error(`v${v}: derived total ${total} != golden ${GOLDEN_TOTALS[v - 1]}`);
            }
        }
    });

    it('lists blocks shorter-first within each version', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const blocks = ecMBlocks(v);
            for (let i = 1; i < blocks.length; i++) {
                if (blocks[i].data < blocks[i - 1].data) {
                    throw new Error(`v${v}: block order violates shorter-first`);
                }
            }
        }
    });

    it('data codewords equal totals minus all parity', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const expectData = GOLDEN_TOTALS[v - 1] - GOLDEN_EC_PER_BLOCK[v - 1] * GOLDEN_BLOCK_COUNTS[v - 1];
            if (dataCodewords(v) !== expectData) {
                throw new Error(`v${v}: data ${dataCodewords(v)} != expected ${expectData}`);
            }
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
            expect(JSON.stringify(got)).toEqual(JSON.stringify(want));
        }
    });

    it('returns golden alignment-pattern center coordinates', () => {
        // ISO/IEC 18004 Annex E Table E.1 rows
        const centers = [
            [2, [6, 18]], [3, [6, 22]], [7, [6, 22, 38]], [8, [6, 24, 42]],
            [11, [6, 30, 54]], [14, [6, 26, 46, 66]], [15, [6, 26, 48, 70]]
        ];
        for (const [v, want] of centers) {
            expect(JSON.stringify(alignmentCenters(v))).toEqual(JSON.stringify(want));
        }
        expect(JSON.stringify(alignmentCenters(1))).toEqual(JSON.stringify([]));
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
            if (formatInfoBits(EC_LEVEL_BITS.M, mask) !== golden[mask]) {
                throw new Error(
                    `EC-M mask${mask}: got ${formatInfoBits(EC_LEVEL_BITS.M, mask)}, golden ${golden[mask]}`
                );
            }
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
            let threw = false;
            try { fn(0); } catch { threw = true; }
            if (!threw) throw new Error('version 0 accepted');
            threw = false;
            try { fn(MAX_VERSION + 1); } catch { threw = true; }
            if (!threw) throw new Error('version above max accepted');
        }
    });

    it('versionInfoBits rejects versions below 7', () => {
        let threw = false;
        try { versionInfoBits(6); } catch { threw = true; }
        if (!threw) throw new Error('version 6 accepted by versionInfoBits');
    });
});
