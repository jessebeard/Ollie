
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

export function forwardDCT(block) {
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
            // Multiply by C(u)/2. 
            // We'll do the 0.25 scaling at the end or split it.
            // Formula: F(u) = C(u)/2 * sum...
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
            // Formula: F(v) = C(v)/2 * sum...
            result[v * 8 + u] = sum * cv * 0.5;
        }
    }

    return result;
}
