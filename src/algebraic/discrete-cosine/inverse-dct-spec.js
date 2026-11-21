/**
 * IDCT Implementations from JPEG T.81 Specification
 * 
 * This file contains three IDCT implementations:
 * 1. idctPureRef - Pure reference from spec (no optimizations)
 * 2. idctOptimizedRef - Separable transform optimization
 * 3. idctFastAAN - Fast AAN algorithm
 */

const COS_TABLE = new Float32Array(64);
for (let k = 0; k < 8; k++) {
    for (let n = 0; n < 8; n++) {
        COS_TABLE[k * 8 + n] = Math.cos(((2 * n + 1) * k * Math.PI) / 16);
    }
}

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
 * @returns {[Float32Array, null] | [null, Error]} Tuple: spatial domain values, or error
 */
export function idctPureRef(coefficients) {
    if (coefficients.length !== 64) {
        return [null, new Error(`Invalid coefficient block length: ${coefficients.length}`)];
    }

    const output = new Float32Array(64);

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;

            for (let v = 0; v < 8; v++) {
                for (let u = 0; u < 8; u++) {

                    const S_vu = coefficients[v * 8 + u];

                    const cos_x_u = COS_TABLE[u * 8 + x];
                    const cos_y_v = COS_TABLE[v * 8 + y];

                    sum += C[u] * C[v] * S_vu * cos_x_u * cos_y_v;
                }
            }

            output[y * 8 + x] = sum * 0.25;
        }
    }

    return [output, null];
}

/**
 * Optimized Reference IDCT - Uses separable 2D transform
 * 
 * Exploits separability: 2D IDCT = 1D IDCT on columns, then 1D IDCT on rows
 * 1D IDCT formula: x[n] = (1/2) * Sum(k=0..7) C[k] * X[k] * cos((2n+1)k*π/16)
 * 
 * @param {Float32Array} coefficients - 64 DCT coefficients in row-major order
 * @returns {[Float32Array, null] | [null, Error]} Tuple: spatial domain values, or error
 */
export function idctOptimizedRef(coefficients) {
    if (coefficients.length !== 64) {
        return [null, new Error(`Invalid coefficient block length: ${coefficients.length}`)];
    }

    const intermediate = new Float32Array(64);
    const output = new Float32Array(64);

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            let sum = 0;
            for (let v = 0; v < 8; v++) {
                const coeff = coefficients[v * 8 + x];
                const cosVal = COS_TABLE[v * 8 + y];
                sum += C[v] * coeff * cosVal;
            }
            intermediate[y * 8 + x] = sum * 0.5;
        }
    }

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let u = 0; u < 8; u++) {
                const val = intermediate[y * 8 + u];
                const cosVal = COS_TABLE[u * 8 + x];
                sum += C[u] * val * cosVal;
            }
            output[y * 8 + x] = sum * 0.5;
        }
    }

    return [output, null];
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

    for (let i = 0; i < 8; i++) {
        idct1D(coefficients, i, 8);
    }

    for (let i = 0; i < 64; i += 8) {
        idct1D(coefficients, i, 1);
    }

    return [coefficients, null];
}

const S0 = 0.35355339059;
const S1 = 0.4903926402;
const S2 = 0.46193976625;
const S3 = 0.41573480615;
const S4 = 0.35355339059;
const S5 = 0.2777851165;
const S6 = 0.19134171618;
const S7 = 0.0975451610;

function idct1D(data, offset, stride) {
    const s0 = offset;
    const s1 = offset + stride;
    const s2 = offset + 2 * stride;
    const s3 = offset + 3 * stride;
    const s4 = offset + 4 * stride;
    const s5 = offset + 5 * stride;
    const s6 = offset + 6 * stride;
    const s7 = offset + 7 * stride;

    const x0 = data[s0] * S0;
    const x1 = data[s1] * S1;
    const x2 = data[s2] * S2;
    const x3 = data[s3] * S3;
    const x4 = data[s4] * S4;
    const x5 = data[s5] * S5;
    const x6 = data[s6] * S6;
    const x7 = data[s7] * S7;

    let tmp0 = x0;
    let tmp1 = x4;
    let tmp2 = x2;
    let tmp3 = x6;

    const tmp10 = tmp0 + tmp1;
    const tmp11 = tmp0 - tmp1;

    const tmp13 = tmp2 + tmp3;
    const tmp12 = (tmp2 - tmp3) * 1.414213562 - tmp13;

    tmp0 = tmp10 + tmp13;
    tmp3 = tmp10 - tmp13;
    tmp1 = tmp11 + tmp12;
    tmp2 = tmp11 - tmp12;

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

    const z5 = (z10 + z12) * 1.847759065;
    const tmp10_ = 1.082392200 * z12 - z5;
    const tmp12_ = -2.613125930 * z10 + z5;

    const tmp6_ = tmp12_ - tmp7_;
    const tmp5_ = tmp11_ - tmp6_;
    const tmp4_ = tmp10_ + tmp5_;

    data[s0] = tmp0 + tmp7_;
    data[s7] = tmp0 - tmp7_;
    data[s1] = tmp1 + tmp6_;
    data[s6] = tmp1 - tmp6_;
    data[s2] = tmp2 + tmp5_;
    data[s5] = tmp2 - tmp5_;
    data[s3] = tmp3 + tmp4_;
    data[s4] = tmp3 - tmp4_;
}
