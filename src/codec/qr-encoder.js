/**
 * ISO/IEC 18004 QR Code encoder.
 * Byte-mode only, EC level M, versions 2-6 (sufficient for otpauth:// URIs).
 *
 * RS parity uses GF(2^8) arithmetic with poly 0x11D (same field parameters
 * as gf256.js but implemented locally for codec isolation).
 */

// Version capacity table: [total codewords, EC codewords] at EC level M, byte mode.
const VERSION_DATA = [
    null,
    { total: 14, ec: 10 },
    { total: 26, ec: 16 },
    { total: 42, ec: 26 },
    { total: 62, ec: 18 },
    { total: 84, ec: 24 },
    { total: 106, ec: 16 }
];

const ALIGNMENT_CENTERS = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

/**
 * Encodes data into a QR code module matrix.
 *
 * @param {Uint8Array} data - Payload bytes (byte-mode encoding)
 * @returns {{size: number, modules: Uint8Array}} Row-major grid (1=dark, 0=light)
 * @throws {Error} If payload is empty or exceeds v6 capacity
 */
export function encodeQR(data) {
    if (!data || !(data instanceof Uint8Array) || data.length === 0) {
        throw new Error('qr: data must be a non-empty Uint8Array');
    }

    // Select version
    let version = 0;
    for (let v = 1; v <= 6; v++) {
        const cap = VERSION_DATA[v];
        const dataCap = cap.total - cap.ec;
        const overhead = 2; // mode indicator + char count ≈ 12 bits → ~2 bytes
        if (data.length + overhead <= dataCap) { version = v; break; }
    }
    if (version === 0) throw new Error(`qr: ${data.length} bytes exceeds max capacity`);
    const { total, ec } = VERSION_DATA[version];
    const dataLen = total - ec;
    const size = 17 + version * 4;

    // Build data bit stream
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4); // byte mode
    push(data.length, version <= 9 ? 8 : 16);
    for (const b of data) push(b, 8);
    // Terminator
    const termLen = Math.min(4, dataLen * 8 - bits.length);
    push(0, termLen);
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad bytes
    const pads = [0xEC, 0x11];
    let pi = 0;
    while (bits.length < dataLen * 8) { push(pads[pi % 2], 8); pi++; }

    // Pack into codewords
    const dcw = new Uint8Array(dataLen);
    for (let i = 0; i < dataLen; i++)
        for (let b = 0; b < 8; b++) dcw[i] |= bits[i * 8 + b] << (7 - b);

    // RS error correction
    const ecw = rsParity(dcw, ec);

    // Concatenate
    const all = new Uint8Array(total);
    all.set(dcw);
    for (let i = 0; i < ec; i++) all[dataLen + i] = ecw[i];

    // Build matrix
    return buildMatrix(all, version);
}

/** Computes QR RS parity using polynomial division over GF(256). */
function rsParity(data, ecLen) {
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

    // Generator polynomial: product of (x - alpha^i) for i in 0..ecLen-1
    const gen = new Uint8Array(ecLen + 1);
    gen[0] = 1;
    for (let d = 1; d <= ecLen; d++) {
        for (let j = d; j > 0; j--) {
            if (gen[j - 1] !== 0) gen[j] ^= mul(gen[j - 1], EXP[d - 1]);
        }
    }

    // LFSR division
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < data.length; i++) {
        const coef = data[i] ^ rem[0];
        for (let j = 0; j < ecLen - 1; j++) rem[j] = rem[j + 1];
        rem[ecLen - 1] = 0;
        if (coef !== 0) {
            for (let j = 0; j < ecLen; j++) {
                if (gen[j + 1] !== 0) rem[j] ^= mul(gen[j + 1], coef);
            }
        }
    }
    return rem;
}

/** Sets a module value and marks it reserved. */
function setModule(m, res, size, row, col, val) {
    m[row * size + col] = val;
    res[row * size + col] = 1;
}

function buildMatrix(codewords, version) {
    const size = 17 + version * 4;
    const m = new Uint8Array(size * size);   // 0=light, 1=dark (after init)
    const res = new Uint8Array(size * size); // reserved flags

    placeFinder(m, res, size, 0, 0);
    placeFinder(m, res, size, 0, size - 7);
    placeFinder(m, res, size, size - 7, 0);
    placeTiming(m, res, size);
    placeAlignment(m, res, size, version);
    setModule(m, res, size, size - 8, 8, 1); // dark module
    reserveFormat(res, size);

    // Zigzag data placement
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let step = 0; step < size; step++) {
            const row = upward ? size - 1 - step : step;
            for (let c = col; c >= col - 1; c--) {
                if (res[row * size + c]) continue;
                const bit = bitIdx < codewords.length * 8
                    ? (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1 : 0;
                m[row * size + c] = bit;
                res[row * size + c] = 1;
                bitIdx++;
            }
        }
        upward = !upward;
    }

    // Masking: try all 8, pick lowest penalty
    let bestM = null, bestP = Infinity;
    for (let mid = 0; mid < 8; mid++) {
        const masked = Uint8Array.from(m);
        applyMask(masked, res, size, mid);
        writeFormat(masked, size, mid);
        const p = evaluatePenalty(masked, size);
        if (p < bestP) { bestP = p; bestM = masked; }
    }

    return { size, modules: bestM };
}

function placeFinder(m, r, s, tr, tc) {
    const p = [[1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]];
    for (let dr = 0; dr < 7; dr++) for (let dc = 0; dc < 7; dc++) {
        m[(tr+dr)*s+(tc+dc)] = p[dr][dc]; r[(tr+dr)*s+(tc+dc)] = 1;
    }
}

function placeTiming(m, r, s) {
    for (let i = 8; i < s - 8; i++) {
        const v = (i % 2 === 0) ? 1 : 0;
        m[6*s+i] = v; r[6*s+i] = 1;
        m[i*s+6] = v; r[i*s+6] = 1;
    }
}

function placeAlignment(m, r, s, version) {
    const centers = ALIGNMENT_CENTERS[version];
    if (!centers || centers.length < 2) return;
    const cr = centers[centers.length - 2], cc = centers[centers.length - 1];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const dark = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0;
        const rr = cr + dr, cc2 = cc + dc;
        if (rr >= 0 && rr < s && cc2 >= 0 && cc2 < s) { m[rr*s+cc2] = dark; r[rr*s+cc2] = 1; }
    }
}

function reserveFormat(r, s) {
    for (let i = 0; i < 9; i++) {
        if (i !== 6) { r[i*s+8] = 1; r[8*s+i] = 1; }
    }
    r[8*s+8] = 1;
    for (let i = 0; i < 8; i++) { r[(s-1-i)*s+8] = 1; r[8*s+(s-1-i)] = 1; }
}

function applyMask(m, r, s, id) {
    for (let row = 0; row < s; row++) for (let col = 0; col < s; col++) {
        if (r[row*s+col]) continue;
        let flip = false;
        switch (id) {
            case 0: flip = (row + col) % 2 === 0; break;
            case 1: flip = row % 2 === 0; break;
            case 2: flip = col % 3 === 0; break;
            case 3: flip = (row + col) % 3 === 0; break;
            case 4: flip = (Math.floor(row/2) + Math.floor(col/3)) % 2 === 0; break;
            case 5: flip = ((row*col)%2 + (row*col)%3) === 0; break;
            case 6: flip = (((row*col)%2 + (row*col)%3)%2) === 0; break;
            case 7: flip = (((row+col)%2 + (row*col)%3)%2) === 0; break;
        }
        if (flip) m[row*s+col] ^= 1;
    }
}

function writeFormat(m, s, maskId) {
    const FMT_MASK = 0x5412;
    const data = maskId; // EC-M format bits = 00
    let bch = data << 10;
    for (let i = 14; i >= 10; i--) if ((bch >> i) & 1) bch ^= 0x537 << (i - 10);
    const fmt = ((data << 10) | bch) ^ FMT_MASK;

    const bits = [];
    for (let i = 0; i < 15; i++) bits.push((fmt >> i) & 1);
    let idx = 0;
    for (let i = 0; i <= 5; i++) m[i*s+8] = bits[idx++];
    m[7*s+8] = bits[idx++];
    m[8*s+8] = bits[idx++];
    m[8*s+7] = bits[idx++];
    for (let i = 5; i >= 0; i--) m[8*s+i] = bits[idx++];
    for (let i = s-1; i >= s-7; i--) m[i*s+8] = bits[idx++];
    for (let i = s-8; i < s; i++) m[8*s+i] = bits[idx++];
}

function evaluatePenalty(m, s) {
    let p = 0;
    for (let dir = 0; dir < 2; dir++)
        for (let i = 0; i < s; i++) {
            let run = 1;
            for (let j = 1; j < s; j++) {
                const cur = dir === 0 ? m[i*s+j] : m[j*s+i];
                const prev = dir === 0 ? m[i*s+j-1] : m[(j-1)*s+i];
                if (cur === prev) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; }
            }
            if (run >= 5) p += 3 + run - 5;
        }
    for (let r = 0; r < s-1; r++) for (let c = 0; c < s-1; c++) {
        const v = m[r*s+c];
        if (m[r*s+c+1]===v && m[(r+1)*s+c]===v && m[(r+1)*s+c+1]===v) p += 3;
    }
    return p;
}
