/**
 * ISO/IEC 18004 QR Code encoder.
 * Byte-mode only, EC level M, versions 1-15 (sufficient for otpauth:// URIs).
 *
 * Consumes the shared spec tables in qr-capacity.js: real EC-M codeword
 * capacities, RS block structures with column-major interleaving, complete
 * function-pattern layout (finders WITH separators, timing, every
 * non-finder alignment combination, dark module, format + version strips),
 * then applies the penalty-selected data mask to all non-function cells.
 *
 * RS parity uses GF(2^8) arithmetic with poly 0x11D (same field parameters
 * as gf256.js but implemented locally for codec isolation).
 */

import {
    MAX_VERSION,
    symbolSize,
    ecMBlocks,
    ecMParity,
    dataCodewords,
    alignmentCenters,
    formatInfoBits,
    EC_LEVEL_BITS
} from './qr-capacity.js';

/**
 * Encodes data into a QR code module matrix.
 *
 * @param {Uint8Array} data - Payload bytes (byte-mode encoding)
 * @returns {{size: number, modules: Uint8Array}} Row-major grid (1=dark, 0=light)
 * @throws {Error} If payload is empty or exceeds v15 capacity
 */
export function encodeQR(data) {
    if (!data || !(data instanceof Uint8Array) || data.length === 0) {
        throw new Error('qr: data must be a non-empty Uint8Array');
    }

    // Select smallest version whose byte-mode capacity fits the payload.
    // Header = 4-bit mode indicator + 8-bit (v<=9) / 16-bit (v>=10) count.
    let version = 0;
    for (let v = 1; v <= MAX_VERSION; v++) {
        const countBits = v <= 9 ? 8 : 16;
        const capBytes = Math.floor((dataCodewords(v) * 8 - 4 - countBits) / 8);
        if (data.length <= capBytes) { version = v; break; }
    }
    if (version === 0) throw new Error(`qr: ${data.length} bytes exceeds max capacity`);

    const dataLen = dataCodewords(version);

    // Build data bit stream
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4); // byte mode
    push(data.length, version <= 9 ? 8 : 16);
    for (const b of data) push(b, 8);
    // Terminator (up to 4 bits, truncated when the codeword boundary is hit)
    const termLen = Math.min(4, dataLen * 8 - bits.length);
    push(0, termLen);
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad codewords alternate 11101100 / 00010001
    const pads = [0xEC, 0x11];
    let pi = 0;
    while (bits.length < dataLen * 8) { push(pads[pi % 2], 8); pi++; }

    const dcw = new Uint8Array(dataLen);
    for (let i = 0; i < dataLen; i++)
        for (let b = 0; b < 8; b++) dcw[i] |= bits[i * 8 + b] << (7 - b);

    return buildMatrix(dcw, version);
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

/**
 * Splits data codewords into RS blocks (shorter-first), computes parity per
 * block, and interleaves: data taken column-major across blocks (short
 * blocks simply run out), then parity column-major (ISO/IEC 18004 §8.5).
 */
function interleaveBlocks(dcw, version) {
    const ecLen = ecMParity(version);
    const groupLens = [];
    for (const g of ecMBlocks(version)) for (let k = 0; k < g.count; k++) groupLens.push(g.data);

    const dataBlocks = [];
    let off = 0;
    for (const len of groupLens) {
        dataBlocks.push(dcw.subarray(off, off + len));
        off += len;
    }
    const ecBlocks = dataBlocks.map((b) => rsParity(b, ecLen));

    const out = [];
    const maxLen = groupLens[groupLens.length - 1]; // shorter-first => last is longest
    for (let r = 0; r < maxLen; r++)
        for (const b of dataBlocks) if (r < b.length) out.push(b[r]);
    for (let j = 0; j < ecLen; j++)
        for (const e of ecBlocks) out.push(e[j]);

    return Uint8Array.from(out);
}

/* ------------------------------------------------------- matrix assembly */

/** Sets a function module (value + function-map flag). */
function setFn(m, fn, size, row, col, val) {
    m[row * size + col] = val;
    fn[row * size + col] = 1;
}

function placeFinder(m, fn, s, tr, tc) {
    const p = [[1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]];
    for (let dr = 0; dr < 7; dr++) for (let dc = 0; dc < 7; dc++) {
        setFn(m, fn, s, tr + dr, tc + dc, p[dr][dc]);
    }
}

/** Light one-module separators ringing each finder (kept clear of data). */
function placeSeparators(fn, s) {
    const mark = (r, c) => { fn[r * s + c] = 1; };
    for (let i = 0; i < 8; i++) {
        mark(7, i); mark(i, 7);                    // top-left ring
        mark(7, s - 1 - i); mark(i, s - 8);        // top-right ring
        mark(s - 8, i); mark(s - 1 - i, 7);        // bottom-left ring
    }
}

function placeTiming(m, fn, s) {
    for (let i = 8; i < s - 8; i++) {
        const v = (i % 2 === 0) ? 1 : 0;
        setFn(m, fn, s, 6, i, v);
        setFn(m, fn, s, i, 6, v);
    }
}

/** Places one 5x5 alignment pattern centered at (cr,cc). */
function placeAlignmentAt(m, fn, s, cr, cc) {
    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            const dark = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0;
            setFn(m, fn, s, cr + dr, cc + dc, dark);
        }
    }
}

/**
 * Places EVERY alignment combination except the three that coincide with
 * finder corners (top-left always; top-right/bottom-left when their
 * center coordinate equals 6). Centers list is symmetric: first=6,
 * last=symbolSize-7.
 */
function placeAlignments(m, fn, s, version) {
    const centers = alignmentCenters(version);
    if (!centers.length) return;
    const last = centers[centers.length - 1];
    for (const ri of centers) {
        for (const ci of centers) {
            if ((ri === 6 && ci === 6) || (ri === 6 && ci === last) || (ri === last && ci === 6)) continue;
            placeAlignmentAt(m, fn, s, ri, ci);
        }
    }
}

function reserveFormatAreas(fn, s) {
    for (let i = 0; i < 9; i++) {
        if (i !== 6) { fn[i * s + 8] = 1; fn[8 * s + i] = 1; }
    }
    fn[8 * s + 8] = 1;
    for (let i = 0; i < 8; i++) { fn[(s - 1 - i) * s + 8] = 1; fn[8 * s + (s - 1 - i)] = 1; }
}

/**
 * Writes both 18-bit version information copies for v>=7 and reserves
 * their cells. Layout mirrors the reference reader: copy A = rows 0-5 x
 * cols [size-11, size-9]; copy B = rows [size-11, size-9] x cols 0-5;
 * both read MSB-first walking y/x descending.
 */
function writeVersionInfo(m, fn, s, version) {
    if (version < 7) return;
    const bitsStr = versionInfoBitsLocal(version);
    const get = (i) => (bitsStr >> (17 - i)) & 1;
    let idx = 0;
    for (let y = 5; y >= 0; y--)
        for (let x = s - 9; x >= s - 11; x--) setFn(m, fn, s, y, x, get(idx++));
    idx = 0;
    for (let x = 5; x >= 0; x--)
        for (let y = s - 9; y >= s - 11; y--) setFn(m, fn, s, y, x, get(idx++));
}

/* Local BCH helper kept thin over the shared table (avoids importing the
 * version helper separately in two call sites). */
import { versionInfoBits } from './qr-capacity.js';
function versionInfoBitsLocal(version) {
    return versionInfoBits(version);
}

function buildMatrix(dcwb, version) {
    const size = symbolSize(version);
    const codewords = interleaveBlocks(dcwb, version);
    const m = new Uint8Array(size * size);   // 0=light, 1=dark
    const fn = new Uint8Array(size * size);  // function-pattern map ONLY

    placeFinder(m, fn, size, 0, 0);
    placeFinder(m, fn, size, 0, size - 7);
    placeFinder(m, fn, size, size - 7, 0);
    placeSeparators(fn, size);
    placeTiming(m, fn, size);
    placeAlignments(m, fn, size, version);
    setFn(m, fn, size, size - 8, 8, 1); // dark module
    reserveFormatAreas(fn, size);
    writeVersionInfo(m, fn, size, version);

    // Zigzag data placement into non-function cells. Data cells are NOT
    // marked in fn - the mask must reach them.
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let step = 0; step < size; step++) {
            const row = upward ? size - 1 - step : step;
            for (let c = col; c >= col - 1; c--) {
                if (fn[row * size + c]) continue;
                const bit = bitIdx < codewords.length * 8
                    ? (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1 : 0;
                m[row * size + c] = bit;
                bitIdx++;
            }
        }
        upward = !upward;
    }

    // Masking: try all 8 patterns over NON-FUNCTION cells, pick lowest penalty
    let bestM = null, bestP = Infinity;
    for (let mid = 0; mid < 8; mid++) {
        const masked = Uint8Array.from(m);
        applyMask(masked, fn, size, mid);
        writeFormat(masked, size, mid);
        const p = evaluatePenalty(masked, size);
        if (p < bestP) { bestP = p; bestM = masked; }
    }

    return { size, modules: bestM };
}

function applyMask(m, fn, s, id) {
    for (let row = 0; row < s; row++) for (let col = 0; col < s; col++) {
        if (fn[row * s + col]) continue;
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
        if (flip) m[row * s + col] ^= 1;
    }
}

function writeFormat(m, s, maskId) {
    // Spec-conformant placement (ISO/IEC 18004 §7.9):
    // 15-bit string written MSB-first along both copies.
    // Copy A wraps the top-left finder:
    //   (8,0)..(8,5),(8,7),(8,8),(7,8),(5,8)..(0,8)
    // Copy B: (8,s-1)..(8,s-7) then (s-8,8)..(s-1,8).
    const fmt = formatInfoBits(EC_LEVEL_BITS.M, maskId);
    const bit = (k) => (fmt >> (14 - k)) & 1;
    let k = 0;
    // Copy A: row 8 cols 0..5, then (8,7),(8,8),(7,8), then col 8 rows 5..0
    for (let i = 0; i <= 5; i++) m[8 * s + i] = bit(k++);
    m[8 * s + 7] = bit(k++);
    m[8 * s + 8] = bit(k++);
    m[7 * s + 8] = bit(k++);
    for (let i = 5; i >= 0; i--) m[i * s + 8] = bit(k++);
    // Copy B: col 8 rows s-1..s-7 (descending), then row 8 cols s-8..s-1
    k = 0;
    for (let i = s - 1; i >= s - 7; i--) m[8 * s + i] = bit(k++);
    for (let i = s - 8; i < s; i++) m[8 * s + i] = bit(k++);
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
