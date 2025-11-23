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
 * Fast AAN IDCT - Placeholder
 * Will implement Arai-Agui-Nakajima algorithm after verifying reference implementations
 */
export function idctFastAAN(coefficients) {
    // TODO: Implement AAN algorithm
    // For now, delegate to optimized reference
    return idctOptimizedRef(coefficients);
}
