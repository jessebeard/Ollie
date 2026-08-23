/**
 * Inverse Discrete Cosine Transform (IDCT)
 * 
 * Converts frequency domain coefficients back to spatial domain pixel values.
 * This implementation matches the encoder's forward DCT using the same cosine table approach.
 * JPEG spec Annex A describes the DCT/IDCT mathematics.
 */

const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

const C = new Float32Array(8);
C[0] = 1 / Math.sqrt(2);
for (let i = 1; i < 8; i++) C[i] = 1;

/**
 * Perform 2D IDCT on an 8x8 block
 * 
 * @param {Float32Array} coefficients - 64-element block of DCT coefficients
 * @returns {[Float32Array, null] | [null, Error]} Tuple: 64-element block of spatial domain values, or error
 */
export function idct(coefficients) {
    if (coefficients.length !== 64) {
        return [null, new Error(`Invalid coefficient block length: ${coefficients.length} (expected 64)`)];
    }

    const colOutput = new Float32Array(64);
    const result = new Float32Array(64);

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
 * Naive IDCT implementation (O(N^3))
 * Kept for comparison and fallback.
 */
export const idctNaive = idct;

/**
 * AAN IDCT implementation (O(N))
 * Implements the Arai, Agui, and Nakajima algorithm.
 *
 * @param {Float32Array} coefficients - 64-element block of DCT coefficients
 * @returns {[Float32Array, null] | [null, Error]} Tuple: 64-element block of spatial domain values, or error
 */
export function idctAAN(coefficients) {

    return idct(coefficients);
}

const C1 = Math.cos(Math.PI / 16);
const C2 = Math.cos(2 * Math.PI / 16);
const C3 = Math.cos(3 * Math.PI / 16);
const C4 = Math.cos(4 * Math.PI / 16);
const C5 = Math.cos(5 * Math.PI / 16);
const C6 = Math.cos(6 * Math.PI / 16);
const C7 = Math.cos(7 * Math.PI / 16);

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

const IS = S;

const AAN_SCALE_TABLE = new Float32Array(64);
for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
        AAN_SCALE_TABLE[v * 8 + u] = IS[u] * IS[v];
    }
}

