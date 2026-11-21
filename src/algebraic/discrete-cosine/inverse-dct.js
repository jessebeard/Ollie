/**
 * Inverse Discrete Cosine Transform (IDCT)
 * 
 * Converts frequency domain coefficients back to spatial domain pixel values.
 * This implementation matches the encoder's forward DCT using the same cosine table approach.
 * JPEG spec Annex A describes the DCT/IDCT mathematics.
 */

const COS_TABLE = new Float64Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

const C = new Float64Array(8);
C[0] = 1 / Math.sqrt(2);
for (let i = 1; i < 8; i++) C[i] = 1;

/**
 * Perform 64-bit double-precision 2D IDCT on an 8x8 block.
 * Reserved for cryptographic and steganographic distortion modeling (J-UNIWARD).
 * 
 * @param {Float64Array|Float32Array|Int32Array|Array<number>} coefficients - 64-element block of DCT coefficients
 * @returns {[Float64Array, null] | [null, Error]} Tuple: 64-element block of spatial domain values, or error
 */
export function idct(coefficients) {
    if (!coefficients || coefficients.length !== 64) {
        return [null, new Error(`Invalid coefficient block length: ${coefficients ? coefficients.length : 0} (expected 64)`)];
    }

    const colOutput = new Float64Array(64);
    const result = new Float64Array(64);

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

    return [result, null];
}

/**
 * Precision Reference IDCT alias.
 */
export const idctPrecision = idct;

/**
 * Naive IDCT alias.
 */
export const idctNaive = idct;

/**
 * AAN IDCT implementation (O(N))
 * Compatibility interface for decoder switching.
 *
 * @param {Float32Array|Float64Array|Int32Array|Array<number>} coefficients - 64-element block of DCT coefficients
 * @returns {[Float64Array|Float32Array, null] | [null, Error]} Tuple: 64-element block of spatial domain values, or error
 */
export function idctAAN(coefficients) {
    if (!coefficients || coefficients.length !== 64) {
        return [null, new Error(`Invalid coefficient block length: ${coefficients ? coefficients.length : 0} (expected 64)`)];
    }
    return idct(coefficients);
}

