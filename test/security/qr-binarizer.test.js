import { describe, it, expect } from '../utils/test-runner.js';
import { encodeQR } from '../../src/codec/qr-encoder.js';
// RED: named export `binarize` does not exist until C4 GREEN.
import { decodeQR, binarize } from '../../src/codec/qr-decoder.js';

/**
 * Uneven-illumination robustness. A single global threshold provably
 * destroys QRs captured with an illumination gradient: on one side dark and
 * light modules collapse to the same side of the cut, erasing finder rings.
 * The adaptive binarizer must threshold each region locally.
 */

/** Renders matrix to RGBA then applies a horizontal luminance gradient. */
function synthGradient(matrix, scale, darkValLeft, lightValLeft, darkValRight, lightValRight) {
    const quiet = 4;
    const dim = (matrix.size + quiet * 2) * scale;
    const data = new Uint8ClampedArray(dim * dim * 4);
    const mid = dim / 2;
    const dithAt = (x, y) => ((x * 7 + y * 13) % 7) - 3;
    // Paint EVERY pixel with the light-field gradient first - including the
    // quiet zone, which must be a lit background, not an untouched (black)
    // buffer.
    for (let y = 0; y < dim; y++) {
        for (let x = 0; x < dim; x++) {
            const t = Math.min(1, Math.max(0, (x - mid * 0.5) / mid));
            const v = Math.max(0, Math.min(255, lightValLeft + (lightValRight - lightValLeft) * t + dithAt(x, y)));
            const i = (y * dim + x) * 4;
            data[i] = v; data[i + 1] = v; data[i + 2] = v;
        }
    }
    // Overwrite dark modules with the dark-field gradient.
    for (let r = 0; r < matrix.size; r++) {
        for (let c = 0; c < matrix.size; c++) {
            if (!matrix.modules[r * matrix.size + c]) continue;
            for (let py = 0; py < scale; py++) {
                for (let px = 0; px < scale; px++) {
                    const x = (c + quiet) * scale + px;
                    const y = (r + quiet) * scale + py;
                    const t = Math.min(1, Math.max(0, (x - mid * 0.5) / mid));
                    const v = Math.max(0, Math.min(255, darkValLeft + (darkValRight - darkValLeft) * t + dithAt(x, y)));
                    const i = (y * dim + x) * 4;
                    data[i] = v; data[i + 1] = v; data[i + 2] = v;
                }
            }
        }
    }
    return { data, width: dim, height: dim };
}

describe('QR adaptive binarization', () => {
    it('binarizer preserves dark modules under a strong illumination gradient', () => {
        // Left half: dark 70 / light 220. Right half: dark 25 / light 95.
        // Any global cut between 95..220 misclassifies the right side's
        // lights or the left side's darks wholesale.
        const w = 64;
        const data = new Uint8ClampedArray(w * w * 4);
        for (let y = 0; y < w; y++) {
            for (let x = 0; x < w; x++) {
                // Two dark 8px squares, one per half, on light backgrounds
                const inDark = (x >= 8 && x < 16 && y >= 28 && y < 36) ||
                               (x >= 40 && x < 48 && y >= 28 && y < 36);
                const darkL = 70, lightL = 220, darkR = 25, lightR = 95;
                const t = Math.min(1, Math.max(0, (x - w * 0.25) / (w * 0.5)));
                // +-3 deterministic dither: real captures always carry a
                // sensor noise floor; without one the near-flat blocks are
                // mathematically degenerate for ANY local method.
                const dith = ((x * 7 + y * 13) % 7) - 3;
                const v = Math.max(0, Math.min(255,
                    (inDark ? darkL + (darkR - darkL) * t : lightL + (lightR - lightL) * t) + dith));
                const i = (y * w + x) * 4;
                data[i] = v; data[i + 1] = v; data[i + 2] = v;
            }
        }
        const [img, err] = binarize({ data, width: w, height: w });
        expect(err).toBe(null);
        let leftDark = 0, rightDark = 0;
        for (let y = 28; y < 36; y++) {
            for (let x = 8; x < 16; x++) if (img.bw[y * w + x] === 1) leftDark++;
            for (let x = 40; x < 48; x++) if (img.bw[y * w + x] === 1) rightDark++;
        }
        expect(leftDark).toBeGreaterThanOrEqual(60);
        expect(rightDark).toBeGreaterThanOrEqual(60);
        // Light regions must stay light on BOTH halves
        let leftLightOk = 0, rightLightOk = 0;
        for (let y = 28; y < 36; y++) {
            if (img.bw[y * w + 20] === 0) leftLightOk++;
            if (img.bw[y * w + 56] === 0) rightLightOk++;
        }
        expect(leftLightOk).toBeGreaterThanOrEqual(7);
        expect(rightLightOk).toBeGreaterThanOrEqual(7);
    });

    it('decodes grayscale renders with sensor-like luminance jitter', () => {
        // Jitter is SMOOTHED after generation: real sensor noise is
        // spatially correlated by the optics/demosaic pipeline, whereas
        // independent per-pixel white noise defeats every local-threshold
        // method equally (each 8x8 block then contains both classes with
        // overlapping ranges, leaving no signal for ANY binarizer).
        const uri = 'otpauth://totp/Ollie:a@x.com?secret=GEZDGNBVGY3TQOJQ&issuer=O';
        const m = encodeQR(new TextEncoder().encode(uri));
        const scale = 4, quiet = 4;
        const dim = (m.size + quiet * 2) * scale;
        let s = 12345 >>> 0;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        const noise = new Float32Array(dim * dim);
        for (let p = 0; p < noise.length; p++) noise[p] = (rnd() * 2 - 1) * 35;
        for (let pass = 0; pass < 2; pass++) {
            const out = new Float32Array(dim * dim);
            for (let y = 0; y < dim; y++) {
                for (let x = 0; x < dim; x++) {
                    let acc = 0, cnt = 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        const yy = y + dy, xx = x + dx;
                        if (yy < 0 || xx < 0 || yy >= dim || xx >= dim) continue;
                        acc += noise[yy * dim + xx]; cnt++;
                    }
                    out[y * dim + x] = acc / cnt;
                }
            }
            noise.set(out);
        }
        const data = new Uint8ClampedArray(dim * dim * 4);
        for (let y = 0; y < dim; y++) {
            for (let x = 0; x < dim; x++) {
                const v = Math.max(0, Math.min(255, 215 + noise[y * dim + x]));
                const i = (y * dim + x) * 4;
                data[i] = v; data[i + 1] = v; data[i + 2] = v;
            }
        }
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c < m.size; c++) {
                const dark = !!m.modules[r * m.size + c];
                for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
                    const y = (r + quiet) * scale + py, x = (c + quiet) * scale + px;
                    const v = Math.max(0, Math.min(255, (dark ? 40 : 215) + noise[y * dim + x]));
                    const i = (y * dim + x) * 4;
                    data[i] = v; data[i + 1] = v; data[i + 2] = v;
                }
            }
        }
        const [r2, err] = decodeQR({ data, width: dim, height: dim });
        expect(err).toEqual(null);
        expect(new TextDecoder().decode(r2.bytes)).toBe(uri);
    });

    it('decodes a QR rendered under a strong horizontal illumination gradient', () => {
        const uri = 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP';
        const m = encodeQR(new TextEncoder().encode(uri));
        const img = synthGradient(m, 4, 70, 220, 25, 95);
        const [result, err] = decodeQR(img);
        expect(err).toBe(null);
        expect(new TextDecoder().decode(result.bytes)).toBe(uri);
    });

    it('decodes a QR on a DARK background (dark-theme screenshot)', () => {
        const uri = 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP';
        const m = encodeQR(new TextEncoder().encode(uri));
        // Inverted polarity: dark modules bright, light modules dark,
        // quiet zone matches the LIGHT modules (bright) so the finder
        // pattern reads as light-on-dark after binarization.
        const quiet = 4;
        const scale = 4;
        const dim = (m.size + quiet * 2) * scale;
        const data = new Uint8ClampedArray(dim * dim * 4);
        for (let p = 0; p < dim * dim; p++) { const i = p * 4; data[i] = 210; data[i+1] = 210; data[i+2] = 210; }
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c < m.size; c++) {
                if (!m.modules[r * m.size + c]) continue; // DARK modules drawn dark
                for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
                    const y = (r + quiet) * scale + py, x = (c + quiet) * scale + px;
                    const i = (y * dim + x) * 4; data[i] = 30; data[i+1] = 30; data[i+2] = 30;
                }
            }
        }
        const [result, err] = decodeQR({ data, width: dim, height: dim });
        expect(err).toBe(null);
        expect(new TextDecoder().decode(result.bytes)).toBe(uri);
    });
});
