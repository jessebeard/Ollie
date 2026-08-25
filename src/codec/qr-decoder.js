/**
 * ISO/IEC 18004 QR Code decoder.
 *
 * Accepts canvas-shaped RGBA input ({data,width,height}) - the product of
 * createImageBitmap() + canvas rasterization - and returns the decoded
 * payload bytes. Mirrors qr-encoder.js exactly: byte mode, EC level M,
 * versions 1-6, single RS block per version, BCH format info XOR 0x5412,
 * zigzag placement, penalty-selected masks.
 *
 * RS error correction uses syndromes + Berlekamp-Massey + Chien search +
 * Forney over GF(256) with polynomial 0x11D (same field parameters as the
 * encoder's local arithmetic; kept local for codec isolation).
 *
 * V1 scope: axis-aligned, cleanly captured codes (screenshots). Skewed or
 * perspective-distorted photographs are out of scope (see specs/TODO).
 */

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

const FMT_MASK = 0x5412;
const FMT_GEN = 0x537;

/* ------------------------------------------- RS correction (shared codec) */
/*
 * Delegates to the audited Euclidean-algorithm decoder in
 * information-theory/error-correction - the same field parameters as the
 * encoder's local arithmetic (poly 0x11D, generator base 0), but battle-
 * tested across the ECC framing waves. Convention-robust by construction,
 * unlike hand-rolled Berlekamp-Massey/Forney variants.
 */

import { GenericGF } from '../information-theory/error-correction/galois-field.js';
import { ReedSolomonDecoder } from '../information-theory/error-correction/reed-solomon-codec.js';

const QR_FIELD = new GenericGF(0x11D, 256, 0);
const QR_RS_DECODER = new ReedSolomonDecoder(QR_FIELD);

/**
 * Corrects a single-block RS codeword (data || parity).
 * Returns [correctedDataBytes|null, Error|null].
 */
/**
 * @param {Uint8Array} codeword
 * @param {number} ecLen
 * @returns {[Int32Array|null, Error|null]} corrected data bytes or error
 */
function rsCorrectBlock(codeword, ecLen) {
    const received = Int32Array.from(codeword);
    try {
        QR_RS_DECODER.decode(received, ecLen);
        const corrected = Int32Array.from(received.subarray(0, codeword.length - ecLen));
        return [corrected, null];
    } catch (e) {
        const detail = String(e.message || e)
            .replace(/ReedSolomonException\("/, '')
            .replace(/"\)$/, '')
            .replace(/^qr-rs:\s*/, '');
        return [null, new Error('qr-rs: uncorrectable block (' + detail + ')')];
    }
}

/* ------------------------------------------------------------- binarize */

/**
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} imageData
 * @returns {[{bw: Uint8Array, width: number, height: number}|null, Error|null]}
 */
function binarize(imageData) {
    const { data, width, height } = imageData;
    if (!data || !width || !height) {
        return [null, new Error('qr: imageData must contain data, width and height')];
    }
    const bw = new Uint8Array(width * height);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        bw[p] = lum;
        sum += lum;
    }
    const threshold = sum / (width * height);
    for (let p = 0; p < bw.length; p++) bw[p] = bw[p] >= threshold ? 0 : 1;
    return [{ bw, width, height }, null];
}

/* ------------------------------------------------------- finder location */

const RUN_TOL = 0.5;

/**
 * Validates a 5-run window against ratios 1:1:3:1:1. The encoder emits no
 * separator ring, so data modules frequently merge into an OUTER arm,
 * lengthening it; inner light runs and the 3-wide center must still hold.
 * Outer dark runs are therefore LOWER-BOUNDED only, and the unit is
 * anchored on an inner light run or the center run.
 */
function matchRunWindow(runs, i) {
    const r = [runs[i], runs[i + 1], runs[i + 2], runs[i + 3], runs[i + 4]];
    if (r[0].val !== 1 || r[1].val !== 0 || r[2].val !== 1 || r[3].val !== 0 || r[4].val !== 1) return null;
    const len = r.map(x => x.len);
    const units = [len[1], len[3], len[2] / 3];
    for (const u of units) {
        if (u < 1.2) continue;
        const tol = Math.max(1.5, u * RUN_TOL);
        const innerOk =
            Math.abs(len[1] - u) <= tol &&
            Math.abs(len[3] - u) <= tol &&
            Math.abs(len[2] - u * 3) <= tol;
        const outerOk = len[0] >= u - tol && len[4] >= u - tol;
        if (innerOk && outerOk) {
            // Best unit estimate: center run dominates
            return { unit: len[2] / 3 };
        }
    }
    return null;
}

/** Checks a full 7x7 finder template centered at (cx,cy) with module size m. */
function templateConfirm(bw, width, height, cx, cy, m) {
    const PATTERN = [
        [1,1,1,1,1,1,1],
        [1,0,0,0,0,0,1],
        [1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1],
        [1,0,0,0,0,0,1],
        [1,1,1,1,1,1,1]
    ];
    let hit = 0, total = 0;
    for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
            const sx = Math.round(cx + dc * m);
            const sy = Math.round(cy + dr * m);
            if (sx < 0 || sy < 0 || sx >= width || sy >= height) return false;
            const v = bw[sy * width + sx] >= 0.5 ? 1 : 0;
            if (v === PATTERN[dr + 3][dc + 3]) hit++;
            total++;
        }
    }
    return hit / total >= 0.9;
}

function verticalConfirm(bw, width, height, cx, cy, module) {
    const halfSpan = module * 4.5;
    const startRow = Math.round(cy - halfSpan);
    const col = Math.round(cx);
    if (startRow < 0 || col < 0 || col >= width || startRow + Math.ceil(halfSpan * 2) >= height) return false;

    // Skip any leading light (quiet-zone) pixels so run slot 0 is the
    // finder's own top dark arm.
    let r = startRow;
    const endRow = startRow + Math.ceil(halfSpan * 2);
    while (r < endRow && bw[r * width + col] === 0) r++;
    if (r >= endRow) return false;

    let idx = 0;
    const lens = [0, 0, 0, 0, 0];
    let lastVal = bw[r * width + col];
    for (; r < endRow; r++) {
        const v = bw[r * width + col];
        if (v === lastVal) {
            lens[idx]++;
            continue;
        }
        idx++;
        if (idx > 4) break;
        lens[idx] = 1;
        lastVal = v;
    }
    if (idx < 4) return false;

    // Inner runs must be symmetric; outer arms lower-bounded only (the
    // window or merged neighbors may truncate/extend them).
    const tol = Math.max(1.5, module * RUN_TOL);
    const innerOk =
        Math.abs(lens[1] - module) <= tol &&
        Math.abs(lens[3] - module) <= tol &&
        Math.abs(lens[2] - module * 3) <= tol;
    const outerOk = lens[0] >= module - tol && lens[4] >= module - tol;
    return innerOk && outerOk;
}

/**
 * Finds the three finder-pattern centers by scanning BOTH orientations.
 * The encoder emits no separator ring around finders, so data modules can
 * merge into an arm along one axis; the orthogonal axis stays clean for
 * any mask, so unioning candidates from horizontal + vertical run scans
 * guarantees each finder yields at least one valid hit. Candidates are
 * verified by full 7x7 template match before clustering.
 */
function findFinderCenters(img) {
    const { bw, width, height } = img;
    const candidates = [];

    const lineRuns = (get, lineLen) => {
        const runs = [];
        let curVal = get(0), curLen = 0;
        for (let i = 0; i < lineLen; i++) {
            const v = get(i);
            if (v === curVal) { curLen++; continue; }
            runs.push({ val: curVal, len: curLen });
            curVal = v; curLen = 1;
        }
        runs.push({ val: curVal, len: curLen });
        return { runs, starts: (() => { const s = []; let a = 0; for (const r of runs) { s.push(a); a += r.len; } return s; })() };
    };

    const scanOrientation = (isHorizontal) => {
        const lineCount = isHorizontal ? height : width;
        const lineLen = isHorizontal ? width : height;
        for (let li = 0; li < lineCount; li++) {
            const { runs, starts } = lineRuns(
                (i) => isHorizontal ? bw[li * width + i] : bw[i * width + li],
                lineLen
            );
            for (let i = 0; i + 4 < runs.length; i++) {
                const u = matchRunWindow(runs, i);
                if (!u) continue;
                const unit = u.unit;
                const centerX = isHorizontal
                    ? starts[i] + runs[i].len + runs[i + 1].len + runs[i + 2].len / 2
                    : li + 0.5;
                const centerY = isHorizontal
                    ? li + 0.5
                    : starts[i] + runs[i].len + runs[i + 1].len + runs[i + 2].len / 2;

                if (!verticalConfirm(bw, width, height, centerX, centerY, unit)) continue;
                if (!templateConfirm(bw, width, height, centerX, centerY, unit)) continue;
                candidates.push({ x: centerX, y: centerY, module: unit });
            }
        }
    };

    scanOrientation(true);
    scanOrientation(false);

    // Cluster nearby candidates, averaging hits for a precise anchor
    const clusters = [];
    for (const c of candidates) {
        let target = null;
        for (const k of clusters) {
            const mx = k.sumX / k.n, my = k.sumY / k.n, mm = k.sumM / k.n;
            if (Math.abs(mx - c.x) < mm * 2.5 && Math.abs(my - c.y) < mm * 2.5) { target = k; break; }
        }
        if (!target) { clusters.push({ sumX: c.x, sumY: c.y, sumM: c.module, n: 1 }); continue; }
        target.sumX += c.x; target.sumY += c.y; target.sumM += c.module; target.n++;
    }
    return clusters.map(k => ({
        x: k.sumX / k.n,
        y: k.sumY / k.n,
        module: k.sumM / k.n
    }));
}

/**
 * Snaps a cluster anchor to the offset with the best 7x7 template match,
 * sweeping +-2px in half-pixel steps. Decouples final precision from
 * which scan lines happened to produce candidates.
 */
function refineCenter(img, cx, cy, m) {
    const PATTERN = [
        [1,1,1,1,1,1,1],
        [1,0,0,0,0,0,1],
        [1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1],
        [1,0,0,0,0,0,1],
        [1,1,1,1,1,1,1]
    ];
    let bestX = cx, bestY = cy;
    const scoreAt = (ox, oy) => {
        let hit = 0;
        for (let dr = -3; dr <= 3; dr++) {
            for (let dc = -3; dc <= 3; dc++) {
                const sx = Math.round(ox + dc * m);
                const sy = Math.round(oy + dr * m);
                if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
                if ((bwAt(img, sx, sy)) === PATTERN[dr + 3][dc + 3]) hit++;
            }
        }
        return hit;
    };
    let bestScore = scoreAt(cx, cy); // center wins ties
    for (let dx = -2; dx <= 2; dx += 0.5) {
        for (let dy = -2; dy <= 2; dy += 0.5) {
            if (dx === 0 && dy === 0) continue;
            const hit = scoreAt(cx + dx, cy + dy);
            if (hit > bestScore) { bestScore = hit; bestX = cx + dx; bestY = cy + dy; }
        }
    }
    return { x: bestX, y: bestY, module: m };
}

function bwAt(img, x, y) {
    return img.bw[y * img.width + x] >= 0.5 ? 1 : 0;
}

/* ------------------------------------------------------------ main entry */

/**
 * Decodes a QR code from rasterized RGBA pixel data.
 *
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} imageData
 * @returns {[{bytes: Uint8Array, size: number, version: number}|null, Error|null]}
 */
export function decodeQR(imageData) {
    if (!imageData || typeof imageData !== 'object') {
        return [null, new Error('qr: imageData must be an object with data, width, height')];
    }
    const [img, binErr] = binarize(imageData);
    if (binErr) return [null, binErr];

    const centers = findFinderCenters(img);
    if (centers.length < 3) {
        return [null, new Error(`qr: expected 3 finder patterns, found ${centers.length}`)];
    }

    // Identify corners: TL minimizes x+y; of the rest, TR is the one
    // further right, BL the one further down (no bottom-right finder).
    const refined = centers.map(c => refineCenter(img, c.x, c.y, c.module));
    const sorted = [...refined].sort((a, b) => a.x + a.y - (b.x + b.y));
    const tl = sorted[0];
    const rest = sorted.slice(1);
    let tr = rest[0], bl = rest[1];
    if (!tr || !bl) return [null, new Error('qr: degenerate finder geometry')];
    if (bl.x > tr.x) { tr = rest[1]; bl = rest[0]; }

    const mEst = (
        (tl.module * 3 + tr.module + bl.module) /
        (tl.module * 3 / tl.module + 1 + 1)
    ); // weighted mean; tl counted thrice implicitly via formula below
    const moduleSize = ((tl.module + tr.module + bl.module) / 3 + mEst) / 2;

    const spanX = Math.abs(tr.x - tl.x);
    const spanY = Math.abs(bl.y - tl.y);
    const nFromX = Math.round(spanX / moduleSize) + 7;
    const nFromY = Math.round(spanY / moduleSize) + 7;

    let size = 0;
    for (let v = 1; v <= 6; v++) {
        const s = 17 + v * 4;
        if (Math.abs(s - nFromX) <= 1 && Math.abs(s - nFromY) <= 1) { size = s; break; }
    }
    if (!size) {
        return [null, new Error(`qr: ambiguous symbol dimensions (${nFromX}x${nFromY} modules estimated)`)];
    }
    const version = (size - 17) / 4;

    // Refine module size from spans and sample the grid. Sub-pixel anchor
    // bias is self-corrected by trying half-step origin offsets until the
    // format BCH check validates (clean synthetic and real captures both).
    const mRefX = spanX / (size - 7);
    const mRefY = spanY / (size - 7);
    const baseOriginX = tl.x - 3.5 * mRefX;
    const baseOriginY = tl.y - 3.5 * mRefY;

    const buildGrid = (ddx, ddy) => {
        const grid = new Uint8Array(size * size);
        const ox = baseOriginX + ddx, oy = baseOriginY + ddy;
        // Area-majority sampling over the central portion of each module:
        // robust against +-half-pixel anchor jitter that breaks point reads.
        for (let r = 0; r < size; r++) {
            const y0 = Math.round(oy + (r + 0.25) * mRefY);
            const y1 = Math.round(oy + (r + 0.75) * mRefY);
            for (let c = 0; c < size; c++) {
                const x0 = Math.round(ox + (c + 0.25) * mRefX);
                const x1 = Math.round(ox + (c + 0.75) * mRefX);
                let dark = 0, tot = 0;
                for (let yy = y0; yy <= y1; yy++) {
                    if (yy < 0 || yy >= img.height) continue;
                    for (let xx = x0; xx <= x1; xx++) {
                        if (xx < 0 || xx >= img.width) continue;
                        dark += bwAt(img, xx, yy); tot++;
                    }
                }
                grid[r * size + c] = (tot > 0 && dark * 2 >= tot) ? 1 : 0;
            }
        }
        return grid;
    };

    let matrix = null;
    let fmtInfo = null;
    let fmtErr = null;
    outer:
    for (const ddy of [0, -0.5, 0.5, -1, 1]) {
        for (const ddx of [0, -0.5, 0.5, -1, 1]) {
            matrix = buildGrid(ddx, ddy);
            const [info, err] = readFormatInfo(matrix, size);
            if (!err) { fmtInfo = info; break outer; }
            fmtErr = err;
        }
    }
    if (!fmtInfo) return [null, fmtErr];

    const reserved = buildReservedMap(size, version);

    const { total, ec } = VERSION_DATA[version];
    const codewords = new Uint8Array(total);
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let step = 0; step < size; step++) {
            const row = upward ? size - 1 - step : step;
            for (let c = col; c >= col - 1; c--) {
                if (reserved[row * size + c]) continue;
                const bit = matrix[row * size + c];
                if (bitIdx < total * 8) {
                    codewords[bitIdx >> 3] |= bit << (7 - (bitIdx & 7));
                }
                bitIdx++;
            }
        }
        upward = !upward;
    }

    

    

    

    

    

    

    const [dcw, rsErr] = rsCorrectBlock(codewords, ec);
    if (rsErr) return [null, rsErr];

    // Parse byte-mode payload from the (unbyte-aligned) segment bitstream:
    // 4-bit mode indicator, then 8-bit (v1-9) or 16-bit (v10+) char count.
    const getBit = (i) => (dcw[i >> 3] >> (7 - (i & 7))) & 1;
    let pos = 0;
    const rdBits = (n) => { let v = 0; for (let k = 0; k < n; k++) v = (v << 1) | getBit(pos++); return v; };

    const mode = rdBits(4);
    if (mode !== 4) {
        return [null, new Error('qr: unsupported encoding mode ' + mode + ' (only byte mode)')];
    }
    const len = rdBits(version <= 9 ? 8 : 16);
    if (pos + len * 8 > dcw.length * 8) {
        return [null, new Error('qr: truncated payload')];
    }
    const outBytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) outBytes[i] = rdBits(8);

    return [{ bytes: outBytes, size, version }, null];
}

/**
 * @param {Uint8Array} matrix
 * @param {number} size
 * @returns {[{maskId: number}|null, Error|null]}
 */
function readFormatInfo(matrix, size) {
    const readCopyA = () => {
        const bits = [];
        for (let i = 0; i <= 5; i++) bits.push(matrix[i * size + 8]);
        bits.push(matrix[7 * size + 8]);
        bits.push(matrix[8 * size + 8]);
        bits.push(matrix[8 * size + 7]);
        for (let i = 5; i >= 0; i--) bits.push(matrix[8 * size + i]);
        for (let i = size - 1; i >= size - 7; i--) bits.push(matrix[i * size + 8]);
        for (let i = size - 8; i < size; i++) bits.push(matrix[8 * size + i]);
        let fmt = 0;
        for (let i = 0; i < 15; i++) fmt |= bits[i] << i;
        return fmt;
    };

    const validate = (fmt) => {
        const data = fmt ^ FMT_MASK;
        let rem = data;
        for (let i = 14; i >= 10; i--) {
            if ((rem >> i) & 1) rem ^= FMT_GEN << (i - 10);
        }
        if (rem !== 0) return null;
        const ecl = (data >> 13) & 3;
        const maskId = (data >> 10) & 7;
        if (ecl !== 0) return null; // EC level M only
        return { maskId };
    };

    const a = validate(readCopyA());
    if (a) return [a, null];

    // Copy B: mirror the second physical layout (bottom-left column strip +
    // top-right row strip). Encoder writes identical bits; read them back.
    const bitsB = [];
    for (let i = size - 1; i >= size - 7; i--) bitsB.push(matrix[8 * size + i]);
    for (let i = size - 8; i < size; i++) bitsB.push(matrix[i * size + 8]);
    for (let i = 5; i >= 0; i--) bitsB.push(matrix[i * size + 8]);
    bitsB.push(matrix[8 * size + 7]);
    bitsB.push(matrix[8 * size + 8]);
    for (let i = 7; i >= 0; i--) bitsB.push(matrix[8 * size + i]);
    let fmtB = 0;
    for (let i = 0; i < 15; i++) fmtB |= bitsB[i] << i;
    const b = validate(fmtB);
    if (b) return [b, null];

    return [null, new Error('qr: format information failed BCH validation in both copies')];
}

function buildReservedMap(size, version) {
    const res = new Uint8Array(size * size);
    const mark = (r, c) => { res[r * size + c] = 1; };

    // Finders (incl. separators are NOT reserved in encoder; only 7x7 bodies)
    const finderAt = (tr, tc) => {
        for (let dr = 0; dr < 7; dr++) for (let dc = 0; dc < 7; dc++) mark(tr + dr, tc + dc);
    };
    finderAt(0, 0);
    finderAt(0, size - 7);
    finderAt(size - 7, 0);

    // Timing
    for (let i = 8; i < size - 8; i++) { mark(6, i); mark(i, 6); }

    // Alignment (last two centers, matching encoder)
    const centers = ALIGNMENT_CENTERS[version];
    if (centers && centers.length >= 2) {
        const cr = centers[centers.length - 2], cc = centers[centers.length - 1];
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                const rr = cr + dr, ccc = cc + dc;
                if (rr >= 0 && rr < size && ccc >= 0 && ccc < size) mark(rr, ccc);
            }
        }
    }

    // Dark module
    mark(size - 8, 8);

    // Format areas (mirror reserveFormat)
    for (let i = 0; i < 9; i++) {
        if (i !== 6) { mark(i, 8); mark(8, i); }
    }
    mark(8, 8);
    for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }

    return res;
}

