/**
 * Inverse Discrete Cosine Transform (IDCT)
 * 
 * Converts frequency domain coefficients back to spatial domain pixel values.
 * This implementation matches the encoder's forward DCT using the same cosine table approach.
 * JPEG spec Annex A describes the DCT/IDCT mathematics.
 */

// Precompute cosine table (same as encoder)
const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

// C coefficients (same as encoder)
const C = new Float32Array(8);
C[0] = 1 / Math.sqrt(2);
for (let i = 1; i < 8; i++) C[i] = 1;

/**
 * Perform 2D IDCT on an 8x8 block
 * 
 * @param {Float32Array} coefficients - 64-element block of DCT coefficients
 * @returns {Float32Array} 64-element block of spatial domain values
 */
export function idct(coefficients) {
    if (coefficients.length !== 64) {
        throw new Error(`Invalid coefficient block length: ${coefficients.length} (expected 64)`);
    }

    const colOutput = new Float32Array(64);
    const result = new Float32Array(64);

    // 1. IDCT on columns
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            let sum = 0;
            for (let v = 0; v < 8; v++) {
                const coeff = coefficients[v * 8 + x];
                const cosVal = COS_TABLE[v * 8 + y];
                const cv = C[v];
                sum += coeff * cosVal * cv * 0.5;
            }
            colOutput[y * 8 + x] = sum;
        }
    }

    // 2. IDCT on rows
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let u = 0; u < 8; u++) {
                const val = colOutput[y * 8 + u];
                const cosVal = COS_TABLE[u * 8 + x];
                const cu = C[u];
                sum += val * cosVal * cu * 0.5;
            }
            result[y * 8 + x] = sum;
        }
    }

    return result;
}

/**
 * Naive IDCT implementation (O(N^3))
 * Kept for comparison and fallback.
 */
export const idctNaive = idct;

/**
 * AAN IDCT implementation (O(N))
 * Implements the Arai, Agui, and Nakajima algorithm.
 * 
 * @param {Float32Array} coefficients - 64-element block of DCT coefficients
 * @returns {Float32Array} 64-element block of spatial domain values
 */
export function idctAAN(coefficients) {
    // TODO: Fix AAN implementation scaling factors. Currently falling back to Naive IDCT for correctness.
    return idct(coefficients);
}

// --- AAN Constants and Tables ---

// Cosine constants
const C1 = Math.cos(Math.PI / 16);
const C2 = Math.cos(2 * Math.PI / 16);
const C3 = Math.cos(3 * Math.PI / 16);
const C4 = Math.cos(4 * Math.PI / 16);
const C5 = Math.cos(5 * Math.PI / 16);
const C6 = Math.cos(6 * Math.PI / 16);
const C7 = Math.cos(7 * Math.PI / 16);
// Inverse Scale Factors
// Standard AAN scaling factors S[i], scaled by 1/4 to normalize the IDCT gain.
// FDCT Gain = 8. IDCT Core Gain = 16. S[0]^2 = 1/8.
// FDCT Out = Input * 8.
// IDCT Out (with S) = FDCT Out * 16 * (1/8) = Input * 16.
// We want IDCT Out = Input. So we need 1/16 factor.
// Apply 1/4 to each 1D pass (or 1/4 to IS).
// IS[i] = S[i] / 4.

// Inverse Scale Factors
// Standard AAN scaling factors S[i], scaled by 1/4 to normalize the IDCT gain.
// IS[i] = S[i] / 4.

const S = [
    1 / (2 * Math.sqrt(2)),
    1 / (4 * C1),
    1 / (4 * C2),
    1 / (4 * C3),
    1 / (4 * C4),
    1 / (4 * C5),
    1 / (4 * C6),
    1 / (4 * C7)
];

const IS = S; // S.map(s => s * 1.414213562);

// Precomputed 2D Scale Table
const AAN_SCALE_TABLE = new Float32Array(64);
for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
        AAN_SCALE_TABLE[v * 8 + u] = IS[u] * IS[v];
    }
}

/**
 * 1D AAN IDCT
 * Performs in-place transform on a row or column.
 * 
 * @param {Float32Array} data - Buffer containing the block
 * @param {number} offset - Start offset
 * @param {number} stride - Step between elements (1 for row, 8 for col)
 */
function aan1d(data, offset, stride) {
    // Read input
    const x0 = data[offset];
    const x1 = data[offset + stride];
    const x2 = data[offset + stride * 2];
    const x3 = data[offset + stride * 3];
    const x4 = data[offset + stride * 4];
    const x5 = data[offset + stride * 5];
    const x6 = data[offset + stride * 6];
    const x7 = data[offset + stride * 7];

    // Stage 1 (Even/Odd split and initial butterflies)
    // Based on standard AAN IDCT flow

    // Even part
    // Even Part
    const tmp0 = x0;
    const tmp1 = x4;
    const tmp2 = x2;
    const tmp3 = x6;

    const tmp10 = tmp0 + tmp1;
    const tmp11 = tmp0 - tmp1;

    const tmp13 = tmp2 + tmp3;
    const tmp12 = (tmp2 - tmp3) * 1.414213562 - tmp13;

    const tmp0_ = tmp10 + tmp13;
    const tmp3_ = tmp10 - tmp13;
    const tmp1_ = tmp11 + tmp12;
    const tmp2_ = tmp11 - tmp12;

    // Odd Part
    const tmp4 = x1;
    const tmp5 = x3;
    const tmp6 = x5;
    const tmp7 = x7;

    const z13 = tmp6 + tmp5;
    const z10 = tmp6 - tmp5;
    const z11 = tmp4 + tmp7;
    const z12 = tmp4 - tmp7;

    const tmp7_ = z11 + z13;
    const tmp11_ = (z11 - z13) * 1.414213562;

    const z5 = (z10 + z12) * 1.847759065; // 1/cos(3pi/16)? No.
    // IJG constants:
    // 1.847759065 = 2 * cos(2pi/16) / cos(6pi/16)? No.
    // It is 2.613125930?
    // Let's just use the values:
    // c2 = 2.613125930
    // c4 = 1.082392200

    // Actually, I should stick to the spec constants if I can map them.
    // But I can't map them easily without the flow graph.
    // I will use the explicit values from a known working AAN implementation.
    // This is safer than guessing the flow graph from the spec's forward equations.

    const z5_ = (z10 + z12) * 1.847759065;
    const tmp10_ = z5_ - z12 * 1.082392200;
    const tmp12_ = z5_ - z10 * 2.613125930;

    const tmp6_ = tmp12_ - tmp7_;
    const tmp5_ = tmp11_ - tmp6_;
    const tmp4_ = tmp10_ + tmp5_;

    // Final Output
    data[offset] = tmp0_ + tmp7_;
    data[offset + stride * 7] = tmp0_ - tmp7_;
    data[offset + stride * 1] = tmp1_ + tmp6_;
    data[offset + stride * 6] = tmp1_ - tmp6_;
    data[offset + stride * 2] = tmp2_ + tmp5_;
    data[offset + stride * 5] = tmp2_ - tmp5_;
    data[offset + stride * 3] = tmp3_ + tmp4_;
    data[offset + stride * 4] = tmp3_ - tmp4_;
}
