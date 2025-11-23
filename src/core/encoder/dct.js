
/**
 * Discrete Cosine Transform (DCT)
 * 
 * The DCT is the heart of JPEG compression. It converts a block of spatial data (pixels)
 * into the frequency domain.
 * 
 * - Low frequencies (large features, background) end up in the top-left corner.
 * - High frequencies (fine details, noise) end up in the bottom-right corner.
 * 
 * This allows us to later discard (quantize) the high-frequency data which the human eye
 * is less sensitive to, achieving compression.
 */
const COS_TABLE = new Float32Array(8 * 8);

// Precompute cosines
// cos((2x + 1) * u * PI / 16)
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}



const C = new Float32Array(8);
C[0] = 1 / Math.sqrt(2);
for (let i = 1; i < 8; i++) C[i] = 1;

export function forwardDCTNaive(block) {
    const rowOutput = new Float32Array(64);
    const result = new Float32Array(64);

    // 1. DCT on rows
    for (let y = 0; y < 8; y++) {
        for (let u = 0; u < 8; u++) {
            let sum = 0;
            for (let x = 0; x < 8; x++) {
                const pixel = block[y * 8 + x];
                const cosVal = COS_TABLE[u * 8 + x]; // cos((2x+1)u pi/16)
                sum += pixel * cosVal;
            }
            const cu = C[u];
            rowOutput[y * 8 + u] = sum * cu * 0.5;
        }
    }

    // 2. DCT on columns
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            for (let y = 0; y < 8; y++) {
                const val = rowOutput[y * 8 + u];
                const cosVal = COS_TABLE[v * 8 + y]; // cos((2y+1)v pi/16)
                sum += val * cosVal;
            }
            const cv = C[v];
            result[v * 8 + u] = sum * cv * 0.5;
        }
    }

    return result;
}

// AAN Constants
const C1 = 0.98078528;
const C2 = 0.92387953;
const C3 = 0.83146961;
const C4 = 0.70710678;
const C5 = 0.55557023;
const C6 = 0.38268343;
const C7 = 0.19509032;

// AAN Scaling Factors (S_i)
// S[i] = 1 / (4 * cos(i * pi / 16))
// S[0] = 1 / (2 * sqrt(2))
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

// Precomputed 2D Scale Table for Forward DCT
const AAN_FDCT_SCALE = new Float32Array(64);
for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
        AAN_FDCT_SCALE[v * 8 + u] = S[u] * S[v];
    }
}

/**
 * 1D AAN Forward DCT
 * Based on the Arai, Agui, and Nakajima algorithm.
 * 
 * @param {Float32Array} data - Input/Output buffer
 * @param {number} offset - Start offset
 * @param {number} stride - Step between elements
 */
function aan_fdct_1d(data, offset, stride) {
    const x0 = data[offset];
    const x1 = data[offset + stride];
    const x2 = data[offset + stride * 2];
    const x3 = data[offset + stride * 3];
    const x4 = data[offset + stride * 4];
    const x5 = data[offset + stride * 5];
    const x6 = data[offset + stride * 6];
    const x7 = data[offset + stride * 7];

    // Stage 1
    const t0 = x0 + x7;
    const t7 = x0 - x7;
    const t1 = x1 + x6;
    const t6 = x1 - x6;
    const t2 = x2 + x5;
    const t5 = x2 - x5;
    const t3 = x3 + x4;
    const t4 = x3 - x4;

    // Even part
    const tmp10 = t0 + t3;
    const tmp11 = t1 + t2;
    const tmp12 = t1 - t2;
    const tmp13 = t0 - t3;

    data[offset] = tmp10 + tmp11; // X[0]
    data[offset + stride * 4] = tmp10 - tmp11; // X[4]

    const z1 = (tmp12 + tmp13) * 0.707106781;
    data[offset + stride * 2] = tmp13 + z1; // X[2]
    data[offset + stride * 6] = tmp13 - z1; // X[6]

    // Odd part
    const tmp10_o = t4 + t5;
    const tmp11_o = t5 + t6;
    const tmp12_o = t6 + t7;

    const z5_j = (tmp10_o - tmp12_o) * 0.382683433;
    const z2_j = 0.541196100 * tmp10_o + z5_j;
    const z4_j = 1.306562965 * tmp12_o + z5_j;
    const z3_j = tmp11_o * 0.707106781;

    const z11_j = t7 + z3_j;
    const z13_j = t7 - z3_j;

    data[offset + stride * 5] = z13_j + z2_j;
    data[offset + stride * 3] = z13_j - z2_j;
    data[offset + stride * 1] = z11_j + z4_j;
    data[offset + stride * 7] = z11_j - z4_j;
}

export function forwardDCTAAN(block) {
    const output = new Float32Array(64);
    const temp = new Float32Array(64);

    // 1. Row DCT
    for (let y = 0; y < 8; y++) {
        // Copy row to temp
        for (let x = 0; x < 8; x++) temp[x] = block[y * 8 + x];
        aan_fdct_1d(temp, 0, 1);
        // Copy back to output (transposed for next step? No, just copy)
        for (let x = 0; x < 8; x++) output[y * 8 + x] = temp[x];
    }

    // 2. Column DCT
    // We can process in-place on 'output' now
    for (let x = 0; x < 8; x++) {
        aan_fdct_1d(output, x, 8);
    }

    // 3. Scaling
    for (let i = 0; i < 64; i++) {
        output[i] *= AAN_FDCT_SCALE[i];
    }

    return output;
}

// Default export (can be switched)
export const forwardDCT = forwardDCTNaive;
