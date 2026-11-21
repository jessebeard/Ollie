/**
 * Factored Spatial J-UNIWARD Distortion Engine with Anti-SCA Perturbation.
 *
 * Implements J-UNIWARD (Holub, Fridrich, Denemark - EURASIP 2014) in pure JavaScript:
 * - 2D IDCT to spatial domain from quantized DCT blocks and quantization tables.
 * - Directional 8-tap Daubechies wavelet filter bank (db8) across horizontal, vertical, and diagonal subbands.
 * - Factored closed-form evaluation of spatial wavelet sensitivity map: xi(r, c) = 1 / (|W(r, c)| + sigma).
 * - Key-randomized anti-SCA (Selection-Channel-Aware) cost perturbation: rho' = rho * (1 + lambda * u_i).
 * - Zero-allocation working buffers for maximum performance on multi-megapixel carriers.
 */
import { idct } from '../../algebraic/discrete-cosine/inverse-dct.js';
import { inverseZigZag, ZIGZAG_ORDER } from '../../algebraic/mappings/inverse-zigzag.js';

export const WET_COST = 1e12;

// Daubechies 8-tap (db8) wavelet filter coefficients
const H_COEFFS = new Float64Array([
    -0.010597401785, 0.032883011667, 0.030841381836, -0.187034811719,
    -0.027983769417, 0.630880767930, 0.714846570553, 0.230377813309
]);

const G_COEFFS = new Float64Array([
    -0.230377813309, 0.714846570553, -0.630880767930, -0.027983769417,
    0.187034811719, 0.030841381836, -0.032883011667, -0.010597401785
]);

const SIGMA = 0.015625; // 2^(-6) stabilizing constant

// 8x8 Daubechies (db8) wavelet response norms for unit DCT basis functions
// Indexed by natural 2D mode r = v * 8 + u (r = 0..63)
export const BASIS_RESPONSE_NORMS = new Float64Array([
    0.00,  0.12,  1.52,  5.38,  8.87, 13.39, 14.65, 14.50,
    0.12,  0.21,  1.49,  5.01,  8.17, 12.27, 13.40, 13.24,
    1.52,  1.49,  2.92,  6.70,  9.81, 14.04, 14.95, 14.66,
    5.38,  5.01,  6.70, 10.80, 13.39, 17.51, 17.70, 17.04,
    8.87,  8.17,  9.81, 13.39, 14.76, 17.83, 17.09, 16.14,
   13.39, 12.27, 14.04, 17.51, 17.83, 20.20, 18.46, 17.10,
   14.65, 13.40, 14.95, 17.70, 17.09, 18.46, 16.20, 14.76,
   14.50, 13.24, 14.66, 17.04, 16.14, 17.10, 14.76, 13.35
]);

const DEFAULT_Q_TABLE_RASTER = new Float32Array([
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99
]);

// Standard luminance quantization table in zigzag scan order
export const DEFAULT_Q_TABLE = new Float32Array(64);
for (let z = 0; z < 64; z++) {
    DEFAULT_Q_TABLE[z] = DEFAULT_Q_TABLE_RASTER[ZIGZAG_ORDER[z]];
}

/**
 * Creates a seeded uniform float generator in [0, 1) for anti-SCA cost perturbation.
 *
 * @param {Uint8Array|string} seed
 * @returns {function(): number}
 */
function createUniformPRNG(seed) {
    const bytes = typeof seed === 'string'
        ? new TextEncoder().encode(seed)
        : (seed instanceof Uint8Array ? seed : new Uint8Array(0));

    let s0 = 0x243F6A88 >>> 0;
    let s1 = 0x85A308D3 >>> 0;
    let s2 = 0x13198A2E >>> 0;
    let s3 = 0x03707344 >>> 0;

    for (let i = 0; i < bytes.length; i++) {
        switch (i & 3) {
            case 0: s0 = Math.imul(s0 ^ bytes[i], 0x01000193) >>> 0; break;
            case 1: s1 = Math.imul(s1 ^ bytes[i], 0x01000193) >>> 0; break;
            case 2: s2 = Math.imul(s2 ^ bytes[i], 0x01000193) >>> 0; break;
            default: s3 = Math.imul(s3 ^ bytes[i], 0x01000193) >>> 0; break;
        }
    }

    const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;

    return function () {
        const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7) >>> 0, 9) + s0) >>> 0;
        const t = (s1 << 9) >>> 0;
        s2 = (s2 ^ s0) >>> 0;
        s3 = (s3 ^ s1) >>> 0;
        s1 = (s1 ^ s2) >>> 0;
        s0 = (s0 ^ s3) >>> 0;
        s2 = (s2 ^ t) >>> 0;
        s3 = rotl(s3, 11);
        return result / 4294967296.0;
    };
}

/**
 * Computes 1D separable convolution on 8x8 spatial block with reflection padding.
 *
 * @param {Float64Array|Float32Array} block - 64 spatial values
 * @param {Float64Array} hFilter - 8-tap horizontal filter
 * @param {Float64Array} vFilter - 8-tap vertical filter
 * @param {Float64Array} out - Pre-allocated 64-element output buffer
 * @param {Float64Array} temp - Pre-allocated 64-element intermediate buffer
 */
function convolveBlock2DInto(block, hFilter, vFilter, out, temp) {
    // Horizontal pass
    for (let y = 0; y < 8; y++) {
        const yOffset = y * 8;
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let k = 0; k < 8; k++) {
                let px = x + k - 3;
                if (px < 0) px = -px - 1;
                else if (px >= 8) px = 15 - px;
                sum += block[yOffset + px] * hFilter[k];
            }
            temp[yOffset + x] = sum;
        }
    }

    // Vertical pass
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            let sum = 0;
            for (let k = 0; k < 8; k++) {
                let py = y + k - 3;
                if (py < 0) py = -py - 1;
                else if (py >= 8) py = 15 - py;
                sum += temp[py * 8 + x] * vFilter[k];
            }
            out[y * 8 + x] = sum;
        }
    }
}

/**
 * Calculates J-UNIWARD distortion costs for a list of quantized DCT blocks.
 *
 * @param {Array<Int32Array>} blocks - List of 64-element quantized DCT blocks
 * @param {Float32Array|Int32Array|Array<number>} [qTable] - 64-element Quantization Table
 * @param {Object} [options]
 * @param {Uint8Array|string} [options.costSeed] - Seed for anti-SCA cost perturbation
 * @param {number} [options.lambda=0.3] - Anti-SCA perturbation strength
 * @param {boolean} [options.includeIndices] - Include flat AC index mappings
 * @param {number} [options.yBlockCount] - Total luminance (Y) blocks before chroma blocks
 * @param {number} [options.chromaPenalty] - Cost multiplier for chroma channels
 * @param {boolean} [options.luminanceOnly] - Restrict cost modeling to luminance blocks
 * @param {boolean} [options.asymmetric] - Apply asymmetric positive/negative distortion penalty
 * @param {boolean} [options.directionalWavelet] - Use directional wavelet subband filters
 * @returns {{rhoPlus: Float64Array, rhoMinus: Float64Array, flatACIndices: Array<{blockIdx: number, coeffIdx: number}>}}
 */
export function calculateJUniwardCosts(blocks, qTable = DEFAULT_Q_TABLE, options = {}) {
    const totalBlocks = blocks.length;
    const totalAC = totalBlocks * 63; // 63 AC coefficients per block (DC is coeff 0)

    const rhoPlus = new Float64Array(totalAC);
    const rhoMinus = new Float64Array(totalAC);
    const includeIndices = options.includeIndices !== false && (options.includeIndices === true || totalBlocks <= 1000);
    const flatACIndices = includeIndices ? new Array(totalAC) : null;

    // Scratchpad buffers scoped to this invocation for thread/reentrancy safety
    const workConvTemp = new Float64Array(64);
    const workW1 = new Float64Array(64);
    const workW2 = new Float64Array(64);
    const workW3 = new Float64Array(64);
    const workDequantZigzag = new Float64Array(64);
    const workDequant2D = new Float32Array(64);

    const uniformPRNG = options.costSeed ? createUniformPRNG(options.costSeed) : null;
    const lambda = options.lambda !== undefined ? options.lambda : 0.01;

    const yBlockCount = options.yBlockCount !== undefined ? options.yBlockCount : totalBlocks;
    const chromaPenalty = options.chromaPenalty !== undefined ? options.chromaPenalty : 4.0;
    const luminanceOnly = options.luminanceOnly === true;
    const asymmetric = options.asymmetric !== false;

    let flatIdx = 0;

    for (let b = 0; b < totalBlocks; b++) {
        const block = blocks[b];
        const isChroma = b >= yBlockCount;

        // 1. Dequantize block in zigzag order: C_zigzag = D_zigzag * Q_zigzag
        for (let c = 0; c < 64; c++) {
            workDequantZigzag[c] = block[c] * qTable[c];
        }

        // 2. Map from zigzag to natural 2D raster order before IDCT
        inverseZigZag(workDequantZigzag, workDequant2D);

        // 3. Spatial IDCT: dequantized DCT (2D raster) -> spatial pixel domain
        const [spatialBlock, idctErr] = idct(workDequant2D);
        if (idctErr || !spatialBlock) {
            // Fallback to uniform costs if IDCT fails
            for (let coeffIdx = 1; coeffIdx < 64; coeffIdx++) {
                rhoPlus[flatIdx] = 1.0;
                rhoMinus[flatIdx] = 1.0;
                if (flatACIndices) flatACIndices[flatIdx] = { blockIdx: b, coeffIdx };
                flatIdx++;
            }
            continue;
        }

        // 4. Compute 3 directional wavelet subbands with reentrant invocation-local buffers
        convolveBlock2DInto(spatialBlock, H_COEFFS, G_COEFFS, workW1, workConvTemp); // horizontal
        convolveBlock2DInto(spatialBlock, G_COEFFS, H_COEFFS, workW2, workConvTemp); // vertical
        convolveBlock2DInto(spatialBlock, G_COEFFS, G_COEFFS, workW3, workConvTemp); // diagonal

        // 5. Compute average block sensitivity directly: xi(r, c) = sum_k (1 / (|W_k(r, c)| + sigma))
        let blockAvgSens = 0;
        for (let p = 0; p < 64; p++) {
            const sensP = (1.0 / (Math.abs(workW1[p]) + SIGMA)) +
                          (1.0 / (Math.abs(workW2[p]) + SIGMA)) +
                          (1.0 / (Math.abs(workW3[p]) + SIGMA));
            blockAvgSens += sensP;
        }
        blockAvgSens /= 64.0;

        // 6. Evaluate factored cost per AC coefficient (coeffIdx 1..63 in zigzag order)
        for (let coeffIdx = 1; coeffIdx < 64; coeffIdx++) {
            const qVal = qTable[coeffIdx];
            const r = ZIGZAG_ORDER[coeffIdx];
            const basisNorm = Math.max(0.1, BASIS_RESPONSE_NORMS[r]);
            const val = block[coeffIdx];

            // Base cost is proportional to quantization step Q_u,v, unit basis wavelet response norm,
            // and spatial texture sensitivity
            let baseCost = (qVal * basisNorm * blockAvgSens) / 25.0;

            // Anti-SCA key-randomized perturbation (default <= 1% jitter)
            if (uniformPRNG) {
                const u = uniformPRNG();
                baseCost *= (1.0 + lambda * u);
            }

            // Chroma channel handling (Cb / Cr)
            if (isChroma) {
                if (luminanceOnly) {
                    rhoPlus[flatIdx] = WET_COST;
                    rhoMinus[flatIdx] = WET_COST;
                    if (flatACIndices) flatACIndices[flatIdx] = { blockIdx: b, coeffIdx };
                    flatIdx++;
                    continue;
                }
                baseCost *= chromaPenalty;
            }

            baseCost = Math.max(0.01, baseCost);

            if (!asymmetric) {
                // Legacy / symmetric test mode fallback
                if (val === 0) baseCost *= 10.0;
                rhoPlus[flatIdx] = baseCost;
                rhoMinus[flatIdx] = baseCost;
            } else {
                // Hardened Anti-Steganalysis Mode:
                // Rule 1: Lock zero coefficients (never allow 0 -> +1 or 0 -> -1, prevents EOB shifts and file bloating)
                if (val === 0) {
                    rhoPlus[flatIdx] = WET_COST;
                    rhoMinus[flatIdx] = WET_COST;
                }
                // Rule 2: Lock +1 -> 0 shrinkage (cannot decrement +1 to 0), penalize outward +1 -> +2
                else if (val === 1) {
                    rhoMinus[flatIdx] = WET_COST;
                    rhoPlus[flatIdx] = Math.max(0.01, 2.5 * baseCost);
                }
                // Rule 3: Lock -1 -> 0 shrinkage (cannot increment -1 to 0), penalize outward -1 -> -2
                else if (val === -1) {
                    rhoPlus[flatIdx] = WET_COST;
                    rhoMinus[flatIdx] = Math.max(0.01, 2.5 * baseCost);
                }
                // Rule 4: Detailed Balance for |val| = 2 (strongly favor inward |2| -> |1| to replenish +/-1 bin)
                else if (val === 2) {
                    rhoMinus[flatIdx] = Math.max(0.01, 0.65 * baseCost);
                    rhoPlus[flatIdx] = Math.max(0.01, 1.25 * baseCost);
                }
                else if (val === -2) {
                    rhoPlus[flatIdx] = Math.max(0.01, 0.65 * baseCost);
                    rhoMinus[flatIdx] = Math.max(0.01, 1.25 * baseCost);
                }
                // Rule 5: Laplacian preservation for |val| >= 3 with boundary overflow protection
                else if (val >= 3) {
                    rhoMinus[flatIdx] = Math.max(0.01, 0.85 * baseCost);
                    rhoPlus[flatIdx] = val >= 1023 ? WET_COST : Math.max(0.01, 1.15 * baseCost);
                }
                else { // val <= -3
                    rhoPlus[flatIdx] = Math.max(0.01, 0.85 * baseCost);
                    rhoMinus[flatIdx] = val <= -1023 ? WET_COST : Math.max(0.01, 1.15 * baseCost);
                }
            }

            if (flatACIndices) flatACIndices[flatIdx] = { blockIdx: b, coeffIdx };
            flatIdx++;
        }
    }

    return {
        rhoPlus,
        rhoMinus,
        flatACIndices
    };
}
