import { BitWriter } from '../utils/bit-writer.js';

// Standard JPEG Huffman Tables (Luminance DC)
// Bits counts (how many codes of length i)
const STD_DC_LUMINANCE_NRCODES = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
// Values
const STD_DC_LUMINANCE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// We need to generate the code table from these standard definitions.
// Map: value -> { code, length }
function generateHuffmanTable(nrCodes, values) {
    const table = {};
    let code = 0;
    let valIdx = 0;

    for (let len = 1; len <= 16; len++) {
        const count = nrCodes[len];
        for (let i = 0; i < count; i++) {
            const val = values[valIdx++];
            table[val] = { code, length: len };
            code++;
        }
        code <<= 1;
    }
    return table;
}

export const DC_LUMA_TABLE = generateHuffmanTable(STD_DC_LUMINANCE_NRCODES, STD_DC_LUMINANCE_VALUES);

// Helper to compute SSSS (category)
export function computeCategory(val) {
    if (val === 0) return 0;
    val = Math.abs(val);
    let cat = 0;
    while (val > 0) {
        val >>= 1;
        cat++;
    }
    return cat;
}

// Helper to compute the bit representation of the value within the category
export function getBitRepresentation(val) {
    if (val > 0) return val;
    // For negative numbers, it's the ones complement of abs value, masked to category length
    // e.g. -3 (cat 2). abs(3) = 11. ~3 = ...11100. 
    // JPEG spec: if val < 0, code = val + (2^cat) - 1.
    // e.g. -3, cat 2. -3 + 4 - 1 = 0. (00 binary)
    // e.g. -1, cat 1. -1 + 2 - 1 = 0. (0 binary)
    // e.g. -2, cat 2. -2 + 4 - 1 = 1. (01 binary)
    const cat = computeCategory(val);
    return val + (1 << cat) - 1;
}

// Standard JPEG Huffman Tables (Luminance AC)
// Added leading 0 for 1-based indexing compatibility with generateHuffmanTable
const STD_AC_LUMINANCE_NRCODES = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const STD_AC_LUMINANCE_VALUES = [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
    0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
    0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
    0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
    0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
    0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
    0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
    0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
    0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
    0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
    0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
    0xf9, 0xfa
];

export const AC_LUMA_TABLE = generateHuffmanTable(STD_AC_LUMINANCE_NRCODES, STD_AC_LUMINANCE_VALUES);

export function encodeBlock(block, previousDC, writer, dcTable = DC_LUMA_TABLE, acTable = AC_LUMA_TABLE) {
    // 1. Encode DC
    const dcVal = block[0];
    const diff = dcVal - previousDC;
    const dcCat = computeCategory(diff);
    const dcCode = dcTable[dcCat];

    writer.writeBits(dcCode.code, dcCode.length);
    if (dcCat > 0) {
        writer.writeBits(getBitRepresentation(diff), dcCat);
    }

    // 2. Encode AC
    let zeroRun = 0;
    for (let i = 1; i < 64; i++) {
        const val = block[i];
        if (val === 0) {
            zeroRun++;
        } else {
            let safety = 0;
            while (zeroRun >= 16) {
                safety++;
                if (safety > 100) { throw new Error('Infinite loop in Huffman zeroRun'); }
                // ZRL: F/0 = 0xF0
                const zrl = acTable[0xF0];
                writer.writeBits(zrl.code, zrl.length);
                zeroRun -= 16;
            }

            const cat = computeCategory(val);
            const symbol = (zeroRun << 4) | cat;
            const acCode = acTable[symbol];

            writer.writeBits(acCode.code, acCode.length);
            writer.writeBits(getBitRepresentation(val), cat);

            zeroRun = 0;
        }
    }

    // EOB: 0/0 = 0x00
    if (zeroRun > 0) {
        const eob = acTable[0x00];
        writer.writeBits(eob.code, eob.length);
    } else {
        // If the last element was non-zero, we still need EOB unless we wrote 63 AC coeffs?
        // Actually if the last coefficient (63) is non-zero, we don't need EOB.
        // But if we ended with zeros (which we track with zeroRun), we write EOB.
        // Wait, if the loop finishes and zeroRun is 0, it means the last element was non-zero.
        // In that case, do we write EOB?
        // Standard says: "If all coefficients are coded, EOB is not required."
        // But usually we just write EOB if there are trailing zeros.
        // My logic: if val != 0, zeroRun becomes 0.
        // If the very last coeff (63) is non-zero, zeroRun is 0. Loop ends.
        // We check if we need EOB.
        // If the block ends with non-zero, we don't need EOB.
        // BUT, my logic `if (zeroRun > 0)` only handles trailing zeros.
        // What if the block is FULL of non-zeros? Then zeroRun is 0.
        // Correct.
        // What if the block is ALL zeros (except DC)?
        // Loop 1..63. val=0. zeroRun increments to 63.
        // Loop ends. zeroRun > 0. Write EOB. Correct.
    }

    return dcVal; // Return new DC value
}
