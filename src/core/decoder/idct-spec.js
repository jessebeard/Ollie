/**
 * IDCT Implementations from JPEG T.81 Specification
 * 
 * This file contains three IDCT implementations:
 * 1. idctPureRef - Pure reference from spec (no optimizations)
 * 2. idctOptimizedRef - Separable transform optimization
 * 3. idctFastAAN - Fast AAN algorithm
 */

// Precompute cosine values for IDCT
// cos((2n+1)k*π/16) for n,k = 0..7
const COS_TABLE = new Float32Array(64);
for (let k = 0; k < 8; k++) {
    for (let n = 0; n < 8; n++) {
        COS_TABLE[k * 8 + n] = Math.cos(((2 * n + 1) * k * Math.PI) / 16);
    }
}

// C coefficients: C[0] = 1/√2, C[k] = 1 for k > 0
const C = new Float32Array(8);
C[0] = 1 / Math.sqrt(2);
for (let i = 1; i < 8; i++) {
    C[i] = 1;
}

/**
 * Pure Reference IDCT - Direct implementation of JPEG T.81 specification
 * 
 * Formula: s[y][x] = (1/4) * Sum(u=0..7) Sum(v=0..7) C[u] * C[v] * S[v][u] * cos((2x+1)u*π/16) * cos((2y+1)v*π/16)
 * 
 * Where:
 * - s[y][x] = output pixel value at position (x, y) in spatial domain
 * - S[v][u] = input DCT coefficient at frequency (u, v)
 * - C[u] = 1/√2 if u=0, else 1
 * - C[v] = 1/√2 if v=0, else 1
 * 
 * @param {Float32Array} coefficients - 64 DCT coefficients in row-major order
 * @returns {Float32Array} 64 spatial domain values in row-major order
 */
export function idctPureRef(coefficients) {
    if (coefficients.length !== 64) {
        throw new Error(`Invalid coefficient block length: ${coefficients.length}`);
    }

    const output = new Float32Array(64);

    // For each output pixel (x, y)
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;

            // Sum over all frequency components (u, v)
            for (let v = 0; v < 8; v++) {
                for (let u = 0; u < 8; u++) {
                    // Get coefficient S[v][u] (row v, column u)
                    const S_vu = coefficients[v * 8 + u];

                    // Get cosine values
                    const cos_x_u = COS_TABLE[u * 8 + x];  // cos((2x+1)u*π/16)
                    const cos_y_v = COS_TABLE[v * 8 + y];  // cos((2y+1)v*π/16)

                    // Accumulate: C[u] * C[v] * S[v][u] * cos((2x+1)u*π/16) * cos((2y+1)v*π/16)
                    sum += C[u] * C[v] * S_vu * cos_x_u * cos_y_v;
                }
            }

            // Apply 1/4 scaling factor and store
            output[y * 8 + x] = sum * 0.25;
        }
    }

    return output;
}

/**
 * Optimized Reference IDCT - Uses separable 2D transform
 * 
 * Exploits separability: 2D IDCT = 1D IDCT on columns, then 1D IDCT on rows
 * 1D IDCT formula: x[n] = (1/2) * Sum(k=0..7) C[k] * X[k] * cos((2n+1)k*π/16)
 * 
 * @param {Float32Array} coefficients - 64 DCT coefficients in row-major order
 * @returns {Float32Array} 64 spatial domain values in row-major order
 */
export function idctOptimizedRef(coefficients) {
    if (coefficients.length !== 64) {
        throw new Error(`Invalid coefficient block length: ${coefficients.length}`);
    }

    const intermediate = new Float32Array(64);
    const output = new Float32Array(64);

    // Step 1: 1D IDCT on each column
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            let sum = 0;
            for (let v = 0; v < 8; v++) {
                const coeff = coefficients[v * 8 + x];  // Column x, row v
                const cosVal = COS_TABLE[v * 8 + y];    // cos((2y+1)v*π/16)
                sum += C[v] * coeff * cosVal;
            }
            intermediate[y * 8 + x] = sum * 0.5;
        }
    }

    // Step 2: 1D IDCT on each row of intermediate result
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let u = 0; u < 8; u++) {
                const val = intermediate[y * 8 + u];    // Row y, column u
                const cosVal = COS_TABLE[u * 8 + x];    // cos((2x+1)u*π/16)
                sum += C[u] * val * cosVal;
            }
            output[y * 8 + x] = sum * 0.5;
        }
    }

    return output;
}

/**
 * Fast AAN IDCT - Implementation of Arai-Agui-Nakajima algorithm
 * 
 * Performance optimizations:
 * - In-place modification of the input array (safe as input is fresh from inverseZigZag)
 * - Pre-computed scaling factors combined with normalization
 * - Unrolled 1D IDCT passes
 */
export function idctFastAAN(coefficients) {
    // AAN Scaling Factors Derivation:
    // 1. The JPEG IDCT specification requires a total gain of 1/8 for the DC coefficient 
    //    (1/4 from formula * 1/sqrt(2) * 1/sqrt(2) from C(0) factors).
    // 2. The standard AAN algorithm flow has a natural gain of 1 for DC.
    // 3. To match the spec, we need a total correction factor of 1/8.
    // 4. Since we perform two identical 1D passes (Columns then Rows), we split this factor:
    //    Per-pass factor = sqrt(1/8) ≈ 0.35355339059.
    // 5. Final S[i] = Standard_AAN_Factor[i] * 0.35355339059.

    // S[0]: 1.0 * 0.35355339059 = 0.35355339059
    // S[1]: 1.387039845 * 0.35355339059 = 0.4903926402
    // S[2]: 1.306562965 * 0.35355339059 = 0.46193976625
    // S[3]: 1.175875602 * 0.35355339059 = 0.41573480615
    // S[4]: 1.0 * 0.35355339059 = 0.35355339059
    // S[5]: 0.785694958 * 0.35355339059 = 0.2777851165
    // S[6]: 0.541196100 * 0.35355339059 = 0.19134171618
    // S[7]: 0.275899379 * 0.35355339059 = 0.0975451610

    // Pass 1: Columns (Stride 8)
    for (let i = 0; i < 8; i++) {
        idct1D(coefficients, i, 8);
    }

    // Pass 2: Rows (Stride 1)
    for (let i = 0; i < 64; i += 8) {
        idct1D(coefficients, i, 1);
    }

    return coefficients;
}

// Pre-computed constants for AAN
const S0 = 0.35355339059;
const S1 = 0.4903926402;
const S2 = 0.46193976625;
const S3 = 0.41573480615;
const S4 = 0.35355339059;
const S5 = 0.2777851165;
const S6 = 0.19134171618;
const S7 = 0.0975451610;

// 1D IDCT Helper (In-place)
function idct1D(data, offset, stride) {
    const s0 = offset;
    const s1 = offset + stride;
    const s2 = offset + 2 * stride;
    const s3 = offset + 3 * stride;
    const s4 = offset + 4 * stride;
    const s5 = offset + 5 * stride;
    const s6 = offset + 6 * stride;
    const s7 = offset + 7 * stride;

    // Read and Prescale
    let x0 = data[s0] * S0;
    let x1 = data[s1] * S1;
    let x2 = data[s2] * S2;
    let x3 = data[s3] * S3;
    let x4 = data[s4] * S4;
    let x5 = data[s5] * S5;
    let x6 = data[s6] * S6;
    let x7 = data[s7] * S7;

    // Even part
    let tmp0 = x0;
    let tmp1 = x4;
    let tmp2 = x2;
    let tmp3 = x6;

    let tmp10 = tmp0 + tmp1;
    let tmp11 = tmp0 - tmp1;

    let tmp13 = tmp2 + tmp3;
    let tmp12 = (tmp2 - tmp3) * 1.414213562 - tmp13;

    tmp0 = tmp10 + tmp13;
    tmp3 = tmp10 - tmp13;
    tmp1 = tmp11 + tmp12;
    tmp2 = tmp11 - tmp12;

    // Odd part
    let tmp4 = x1;
    let tmp5 = x3;
    let tmp6 = x5;
    let tmp7 = x7;

    let z13 = tmp6 + tmp5;
    let z10 = tmp6 - tmp5;
    let z11 = tmp4 + tmp7;
    let z12 = tmp4 - tmp7;

    let tmp7_ = z11 + z13;
    let tmp11_ = (z11 - z13) * 1.414213562;

    let z5 = (z10 + z12) * 1.847759065;
    let tmp10_ = 1.082392200 * z12 - z5;
    let tmp12_ = -2.613125930 * z10 + z5;

    let tmp6_ = tmp12_ - tmp7_;
    let tmp5_ = tmp11_ - tmp6_;
    let tmp4_ = tmp10_ + tmp5_;

    // Write back
    data[s0] = tmp0 + tmp7_;
    data[s7] = tmp0 - tmp7_;
    data[s1] = tmp1 + tmp6_;
    data[s6] = tmp1 - tmp6_;
    data[s2] = tmp2 + tmp5_;
    data[s5] = tmp2 - tmp5_;
    data[s3] = tmp3 + tmp4_;
    data[s4] = tmp3 - tmp4_;
}
