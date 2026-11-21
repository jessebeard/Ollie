/**
 * Shared ISO/IEC 18004 QR Code capacity and spec-constant tables.
 *
 * Single source of truth consumed by BOTH qr-encoder.js and qr-decoder.js.
 * Covers versions 1-15 at error-correction level M - sufficient for
 * otpauth:// TOTP enrollment payloads (real-world vendor codes observed at
 * v8-v11). Golden values cross-checked against an independent ISO-conformant
 * implementation (python-qrcode lineage).
 */

export const MAX_VERSION = 15;

/** Format information mask XOR pattern (ISO/IEC 18004 §7.8.2). */
export const FORMAT_MASK = 0x5412;

/** Version information generator polynomial x^12+x^10+x^8+x^5+x^4+x^2+1. */
const VERSION_GEN = 0x1F25;

/** Format information generator polynomial x^10+x^8+x^5+x^4+x^2+x+1. */
const FORMAT_GEN = 0x537;

/**
 * Error-correction level indicator bits as encoded into format
 * information (ISO/IEC 18004 §7.8.2 Table 14): L=01, M=00, Q=11, H=10.
 */
export const EC_LEVEL_BITS = Object.freeze({ L: 1, M: 0, Q: 3, H: 2 });

/* Per-version EC-M structure: symbol side length, RS parity codewords per
 * block, and interleaved RS block groups [{count, data}] listed shorter-
 * first (ISO/IEC 18004 Tables 13-27, level M column). */
const VERSIONS = [
    /* v  size  ec/blocks */
    null,
    { size: 21, ec: 10, blocks: [{ count: 1, data: 16 }] },
    { size: 25, ec: 16, blocks: [{ count: 1, data: 28 }] },
    { size: 29, ec: 26, blocks: [{ count: 1, data: 44 }] },
    { size: 33, ec: 18, blocks: [{ count: 2, data: 32 }] },
    { size: 37, ec: 24, blocks: [{ count: 2, data: 43 }] },
    { size: 41, ec: 16, blocks: [{ count: 4, data: 27 }] },
    { size: 45, ec: 18, blocks: [{ count: 4, data: 31 }] },
    { size: 49, ec: 22, blocks: [{ count: 2, data: 38 }, { count: 2, data: 39 }] },
    { size: 53, ec: 22, blocks: [{ count: 3, data: 36 }, { count: 2, data: 37 }] },
    { size: 57, ec: 26, blocks: [{ count: 4, data: 43 }, { count: 1, data: 44 }] },
    { size: 61, ec: 30, blocks: [{ count: 1, data: 50 }, { count: 4, data: 51 }] },
    { size: 65, ec: 22, blocks: [{ count: 6, data: 36 }, { count: 2, data: 37 }] },
    { size: 69, ec: 22, blocks: [{ count: 8, data: 37 }, { count: 1, data: 38 }] },
    { size: 73, ec: 24, blocks: [{ count: 4, data: 40 }, { count: 5, data: 41 }] },
    { size: 77, ec: 24, blocks: [{ count: 5, data: 41 }, { count: 5, data: 42 }] }
];

/* RS block structures for ALL four error-correction levels, indexed by
 * FORMAT-INFO ECL BITS (EC_LEVEL_BITS): [M=0, L=1, H=2, Q=3]. Symbol sizes
 * and total codewords are level-independent; only the data/parity split
 * differs. Enables the decoder to correct codes written at any level -
 * real-world vendor TOTP QRs are not all EC-M.
 * (ISO/IEC 18004 Tables 13-27, columns L / Q / H.) */
const BLOCKS_BY_ECL = [
    /* M */ VERSIONS.slice(1).map((v) => ({ ec: v.ec, blocks: v.blocks })),
    /* L */ [
        { ec: 7,  blocks: [{ count: 1, data: 19 }] },
        { ec: 10, blocks: [{ count: 1, data: 34 }] },
        { ec: 15, blocks: [{ count: 1, data: 55 }] },
        { ec: 20, blocks: [{ count: 1, data: 80 }] },
        { ec: 26, blocks: [{ count: 1, data: 108 }] },
        { ec: 18, blocks: [{ count: 2, data: 68 }] },
        { ec: 20, blocks: [{ count: 2, data: 78 }] },
        { ec: 24, blocks: [{ count: 2, data: 97 }] },
        { ec: 30, blocks: [{ count: 2, data: 116 }] },
        { ec: 18, blocks: [{ count: 2, data: 68 }, { count: 2, data: 69 }] },
        { ec: 20, blocks: [{ count: 4, data: 81 }] },
        { ec: 24, blocks: [{ count: 2, data: 92 }, { count: 2, data: 93 }] },
        { ec: 26, blocks: [{ count: 4, data: 107 }] },
        { ec: 30, blocks: [{ count: 3, data: 115 }, { count: 1, data: 116 }] },
        { ec: 22, blocks: [{ count: 5, data: 87 }, { count: 1, data: 88 }] }
    ],
    /* H */ [
        { ec: 17, blocks: [{ count: 1, data: 9 }] },
        { ec: 28, blocks: [{ count: 1, data: 16 }] },
        { ec: 22, blocks: [{ count: 2, data: 13 }] },
        { ec: 16, blocks: [{ count: 4, data: 9 }] },
        { ec: 22, blocks: [{ count: 2, data: 11 }, { count: 2, data: 12 }] },
        { ec: 28, blocks: [{ count: 4, data: 15 }] },
        { ec: 26, blocks: [{ count: 4, data: 13 }, { count: 1, data: 14 }] },
        { ec: 26, blocks: [{ count: 4, data: 14 }, { count: 2, data: 15 }] },
        { ec: 24, blocks: [{ count: 4, data: 12 }, { count: 4, data: 13 }] },
        { ec: 28, blocks: [{ count: 6, data: 15 }, { count: 2, data: 16 }] },
        { ec: 24, blocks: [{ count: 3, data: 12 }, { count: 8, data: 13 }] },
        { ec: 28, blocks: [{ count: 7, data: 14 }, { count: 4, data: 15 }] },
        { ec: 22, blocks: [{ count: 12, data: 11 }, { count: 4, data: 12 }] },
        { ec: 24, blocks: [{ count: 11, data: 12 }, { count: 5, data: 13 }] },
        { ec: 24, blocks: [{ count: 11, data: 12 }, { count: 7, data: 13 }] }
    ],
    /* Q */ [
        { ec: 13, blocks: [{ count: 1, data: 13 }] },
        { ec: 22, blocks: [{ count: 1, data: 22 }] },
        { ec: 18, blocks: [{ count: 2, data: 17 }] },
        { ec: 26, blocks: [{ count: 2, data: 24 }] },
        { ec: 18, blocks: [{ count: 2, data: 15 }, { count: 2, data: 16 }] },
        { ec: 24, blocks: [{ count: 4, data: 19 }] },
        { ec: 18, blocks: [{ count: 2, data: 14 }, { count: 4, data: 15 }] },
        { ec: 22, blocks: [{ count: 4, data: 18 }, { count: 2, data: 19 }] },
        { ec: 20, blocks: [{ count: 4, data: 16 }, { count: 4, data: 17 }] },
        { ec: 24, blocks: [{ count: 6, data: 19 }, { count: 2, data: 20 }] },
        { ec: 28, blocks: [{ count: 4, data: 22 }, { count: 4, data: 23 }] },
        { ec: 26, blocks: [{ count: 4, data: 20 }, { count: 6, data: 21 }] },
        { ec: 24, blocks: [{ count: 8, data: 20 }, { count: 4, data: 21 }] },
        { ec: 20, blocks: [{ count: 11, data: 16 }, { count: 5, data: 17 }] },
        { ec: 30, blocks: [{ count: 5, data: 24 }, { count: 7, data: 25 }] }
    ]
];

/* Alignment-pattern center coordinates per version (Annex E Table E.1).
 * v1 has none; combinations overlapping finder corners are skipped when
 * materializing patterns (see alignmentCenters consumers). */
const ALIGNMENT_CENTERS = [
    null,
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70]
];

/** @param {number} version */
function assertVersion(version) {
    if (!Number.isInteger(version) || version < 1 || version > MAX_VERSION) {
        throw new Error('qr-capacity: version ' + version + ' outside supported range 1..' + MAX_VERSION);
    }
}

/**
 * Symbol side length in modules (includes the 4-module quiet zone? No -
 * symbol proper only; quiet zone is a production requirement).
 *
 * @param {number} version
 * @returns {number} modules per side (21 for v1, +4 per version)
 */
export function symbolSize(version) {
    assertVersion(version);
    return VERSIONS[version].size;
}

/**
 * RS block groups at EC level M, listed shorter-first.
 *
 * @param {number} version
 * @returns {Array<{count: number, data: number}>} defensive copies
 */
export function ecMBlocks(version) {
    assertVersion(version);
    return VERSIONS[version].blocks.map((b) => ({ count: b.count, data: b.data }));
}

/** @param {number} eclBits one of EC_LEVEL_BITS values */
function assertEcl(eclBits) {
    if (!Number.isInteger(eclBits) || eclBits < 0 || eclBits > 3) {
        throw new Error('qr-capacity: ECL bits ' + eclBits + ' outside range 0..3');
    }
}

/**
 * RS block groups for ANY error-correction level, listed shorter-first.
 *
 * @param {number} eclBits format-info level bits (EC_LEVEL_BITS)
 * @param {number} version
 * @returns {Array<{count: number, data: number}>} defensive copies
 */
export function blocksFor(eclBits, version) {
    assertEcl(eclBits);
    assertVersion(version);
    return BLOCKS_BY_ECL[eclBits][version - 1].blocks.map((b) => ({ count: b.count, data: b.data }));
}

/**
 * Reed-Solomon parity codewords per block for any EC level.
 *
 * @param {number} eclBits format-info level bits (EC_LEVEL_BITS)
 * @param {number} version
 * @returns {number}
 */
export function parityFor(eclBits, version) {
    assertEcl(eclBits);
    assertVersion(version);
    return BLOCKS_BY_ECL[eclBits][version - 1].ec;
}

/**
 * Reed-Solomon parity codewords per block at EC level M.
 *
 * @param {number} version
 * @returns {number}
 */
export function ecMParity(version) {
    assertVersion(version);
    return VERSIONS[version].ec;
}

/**
 * Total codeword count (data + parity across all blocks) at EC level M.
 *
 * @param {number} version
 * @returns {number}
 */
export function totalCodewords(version) {
    assertVersion(version);
    const vd = VERSIONS[version];
    const nBlocks = vd.blocks.reduce((a, b) => a + b.count, 0);
    const data = vd.blocks.reduce((a, b) => a + b.count * b.data, 0);
    return data + nBlocks * vd.ec;
}

/**
 * Data codeword capacity (payload room before bit-level overhead) at EC-M.
 *
 * @param {number} version
 * @returns {number}
 */
export function dataCodewords(version) {
    assertVersion(version);
    const vd = VERSIONS[version];
    return vd.blocks.reduce((a, b) => a + b.count * b.data, 0);
}

/**
 * Alignment-pattern center coordinate set for a version (Annex E). Callers
 * enumerate all (row, col) pairs from this list EXCEPT the three pairs that
 * coincide with finder corners (top-left always; top-right/bottom-left when
 * their coordinates equal 6).
 *
 * @param {number} version
 * @returns {number[]}
 */
export function alignmentCenters(version) {
    assertVersion(version);
    return [...ALIGNMENT_CENTERS[version]];
}

/**
 * Computes the 15-bit format information string (5 data bits: 2 ECL + 3
 * mask, BCH-coded with 0x537, XOR-masked with 0x5412).
 *
 * @param {number} eclBits one of EC_LEVEL_BITS
 * @param {number} maskId 0-7
 * @returns {number} 15-bit format string
 */
export function formatInfoBits(eclBits, maskId) {
    const data = ((eclBits & 3) << 3) | (maskId & 7);
    let reg = data << 10;
    for (let i = 14; i >= 10; i--) {
        if ((reg >> i) & 1) reg ^= FORMAT_GEN << (i - 10);
    }
    return (((data << 10) | reg) ^ FORMAT_MASK) & 0x7FFF;
}

/**
 * Computes the 18-bit version information string (BCH(18,6), generator
 * 0x1F25, unmasked). Versions 1-6 carry no version information.
 *
 * @param {number} version 7..MAX_VERSION
 * @returns {number} 18-bit version string
 */
export function versionInfoBits(version) {
    assertVersion(version);
    if (version < 7) {
        throw new Error('qr-capacity: version ' + version + ' carries no version information');
    }
    const data = version & 0x3F;
    let rem = data << 12;
    for (let i = 17; i >= 12; i--) {
        if ((rem >> i) & 1) rem ^= VERSION_GEN << (i - 12);
    }
    return ((data << 12) | rem) & 0x3FFFF;
}
