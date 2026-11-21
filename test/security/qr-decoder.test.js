import { describe, it, expect } from '../utils/test-runner.js';
import { encodeQR } from '../../src/codec/qr-encoder.js';
import {
    decodeQR,
    decodeWithCorners,
    binarize,
    findFindersRef,
    findAlignment,
    makeHomography,
    decodeGeometry,
    negateBitmap,
    applyMaskInverse,
    readFormatInfo,
    buildReservedMap
} from '../../src/codec/qr-decoder.js';
import {
    EC_LEVEL_BITS,
    formatInfoBits,
    alignmentCenters,
    MAX_VERSION
} from '../../src/codec/qr-capacity.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';

/**
 * Renders an encoder matrix into canvas-shaped RGBA at the given pixel
 * scale (with a 4-module quiet zone), mimicking what createImageBitmap +
 * canvas rasterization produces for a photographed/screenshot QR.
 */
function synthesize(matrix, scale = 4) {
    const quiet = 4;
    const dim = (matrix.size + quiet * 2) * scale;
    const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
    for (let r = 0; r < matrix.size; r++) {
        for (let c = 0; c < matrix.size; c++) {
            if (!matrix.modules[r * matrix.size + c]) continue;
            for (let py = 0; py < scale; py++) {
                for (let px = 0; px < scale; px++) {
                    const y = (r + quiet) * scale + py;
                    const x = (c + quiet) * scale + px;
                    const i = (y * dim + x) * 4;
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                }
            }
        }
    }
    return { data, width: dim, height: dim };
}

describe('QR decoder core (roundtrip vs encoder)', () => {
    it('decodes a short ASCII payload back byte-exactly', () => {
        const payload = new TextEncoder().encode('Hello, Ollie!');
        const [result, err] = decodeQR(synthesize(encodeQR(payload)));
        expect(err).toEqual(null);
        expect(Array.from(result.bytes)).toEqual(Array.from(payload));
    });

    it('decodes an otpauth:// URI shaped payload', () => {
        const uri = 'otpauth://totp/Ollie:alice@x.com?secret=GEZDGNBVGY3TQOJQ&issuer=Ollie';
        const payload = new TextEncoder().encode(uri);
        const [result, err] = decodeQR(synthesize(encodeQR(payload)));
        expect(err).toEqual(null);
        expect(new TextDecoder().decode(result.bytes)).toBe(uri);
    });

    it('covers every encoder-supported version via a length ladder', () => {
        // v1:~5B ... v6:~80B data capacity at EC-M; probe payloads around each boundary.
        const ladder = [5, 14, 26, 42, 62, 80];
        for (const len of ladder) {
            const payload = new Uint8Array(len);
            for (let i = 0; i < len; i++) payload[i] = (i * 37 + 11) & 0xFF;
            const [result, err] = decodeQR(synthesize(encodeQR(payload)));
            expect(err).toEqual(null);
            if (result.bytes.length !== len) throw new Error(`len ${len}: got ${result.bytes.length}`);
            for (let i = 0; i < len; i++) {
                if (result.bytes[i] !== payload[i]) throw new Error(`byte mismatch at ${i}`);
            }
        }
    });

    it('is scale-independent across plausible screenshot densities', () => {
        const payload = new TextEncoder().encode('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP');
        const matrix = encodeQR(payload);
        for (const scale of [3, 4, 6, 8]) {
            const [result, err] = decodeQR(synthesize(matrix, scale));
            expect(err).toEqual(null);
            expect(new TextDecoder().decode(result.bytes)).toBe('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP');
        }
    });

    it('property: random byte payloads roundtrip through encode->render->decode', async () => {
        await assertProperty(
            [Arbitrary.array(Arbitrary.integer(0, 255), 8, 70)],
            async (bytesArr) => {
                const payload = new Uint8Array(bytesArr);
                if (payload.length === 0) return true;
                const [result, err] = decodeQR(synthesize(encodeQR(payload)));
                if (err) throw new Error(`decode failed: ${err.message}`);
                if (result.bytes.length !== payload.length) throw new Error('length drift');
                for (let i = 0; i < payload.length; i++) {
                    if (result.bytes[i] !== payload[i]) throw new Error(`drift at ${i}`);
                }
                return true;
            },
            25
        );
    });
});

describe('QR decoder robustness', () => {
    it('corrects scattered module damage within EC-M tolerance', () => {
        const payload = new TextEncoder().encode('otpauth://totp/dmg?secret=JBSWY3DPEHPK3PXP');
        const m = encodeQR(payload);
        // Flip 6 scattered DATA-region modules (bottom-right quadrant),
        // deterministic placement
        let flipped = 0;
        for (let r = m.size - 3; r >= 10 && flipped < 6; r -= 2) {
            for (let c = m.size - 3; c >= 10 && flipped < 6; c -= 3) {
                m.modules[r * m.size + c] ^= 1;
                flipped++;
            }
        }
        if (flipped !== 6) throw new Error('test setup flipped ' + flipped);
        const [result, err] = decodeQR(synthesize(m));
        expect(err).toEqual(null);
        expect(new TextDecoder().decode(result.bytes)).toBe('otpauth://totp/dmg?secret=JBSWY3DPEHPK3PXP');
    });

    it('fails closed when format information is destroyed', () => {
        const payload = new TextEncoder().encode('otpauth://totp/dead?secret=JBSWY3DPEHPK3PXP');
        const m = encodeQR(payload);
        // Wipe both format-copy strips so no valid BCH pattern remains.
        for (let i = 0; i < 9; i++) { m.modules[i * m.size + 8] = 0; m.modules[8 * m.size + i] = 0; }
        for (let i = 0; i < 8; i++) { m.modules[(m.size - 1 - i) * m.size + 8] = 0; m.modules[8 * m.size + (m.size - 1 - i)] = 0; }
        const [, err] = decodeQR(synthesize(m));
        expect(err instanceof Error).toBe(true);
    });

    it('returns a tuple and never throws on hostile inputs', () => {
        for (const input of [null, undefined, {}, { data: new Uint8ClampedArray(9), width: 0, height: 3 }]) {
            let threw = false;
            let res = null, err = null;
            try { [res, err] = decodeQR(input); } catch { threw = true; }
            expect(threw).toBe(false);
            expect(res).toBe(null);
            expect(err instanceof Error).toBe(true);
        }
    });

    it('rejects blank and tiny images with typed errors', () => {
        const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 };
        const [, errBlank] = decodeQR(blank);
        expect(errBlank instanceof Error).toBe(true);
        expect(errBlank.message).toBe('qr: fewer than 3 finder patterns found');

        const tiny = { data: new Uint8ClampedArray(4).fill(255), width: 1, height: 1 };
        const [, errTiny] = decodeQR(tiny);
        expect(errTiny instanceof Error).toBe(true);
    });
});

describe('QR decoder sub-components (isolated unit tests)', () => {
    it('binarize: validates input and handles flat/checkerboard images', () => {
        const [, errNull] = binarize(null);
        expect(errNull instanceof Error).toBe(true);

        const [, errEmpty] = binarize({ data: null, width: 0, height: 0 });
        expect(errEmpty instanceof Error).toBe(true);

        // Pure white image -> all pixels light (0)
        const whiteData = new Uint8ClampedArray(16 * 16 * 4).fill(255);
        const [whiteImg, errWhite] = binarize({ data: whiteData, width: 16, height: 16 });
        expect(errWhite).toBe(null);
        expect(whiteImg.width).toBe(16);
        expect(whiteImg.height).toBe(16);
        for (let i = 0; i < whiteImg.bw.length; i++) {
            expect(whiteImg.bw[i]).toBe(0);
        }

        // Pure black image -> all pixels dark (1)
        const blackData = new Uint8ClampedArray(16 * 16 * 4).fill(0);
        const [blackImg, errBlack] = binarize({ data: blackData, width: 16, height: 16 });
        expect(errBlack).toBe(null);
        for (let i = 0; i < blackImg.bw.length; i++) {
            expect(blackImg.bw[i]).toBe(1);
        }
    });

    it('readFormatInfo: extracts exact format bits and validates parameters', () => {
        const [, errNull] = readFormatInfo(null, 21);
        expect(errNull instanceof Error).toBe(true);

        const [, errSmall] = readFormatInfo(new Uint8Array(100), 10);
        expect(errSmall instanceof Error).toBe(true);

        // Test all 32 canonical combinations across all 4 ECLs and 8 masks
        const ecls = [EC_LEVEL_BITS.M, EC_LEVEL_BITS.L, EC_LEVEL_BITS.H, EC_LEVEL_BITS.Q];
        for (const ecl of ecls) {
            for (let mask = 0; mask < 8; mask++) {
                const bits = formatInfoBits(ecl, mask);
                const size = 21;
                const matrix = new Uint8Array(size * size);

                // Write copy A: (8,0)..(8,5),(8,7),(8,8),(7,8),(5,8)..(0,8)
                const putA = (row, col, bit) => { matrix[row * size + col] = bit; };
                for (let i = 0; i <= 5; i++) putA(8, i, (bits >> (14 - i)) & 1);
                putA(8, 7, (bits >> (14 - 6)) & 1);
                putA(8, 8, (bits >> (14 - 7)) & 1);
                putA(7, 8, (bits >> (14 - 8)) & 1);
                for (let i = 5; i >= 0; i--) putA(i, 8, (bits >> (14 - (9 + 5 - i))) & 1);

                // Write copy B: (8,size-1)..(8,size-7) then (size-8,8)..(size-1,8)
                const putB = (row, col, bit) => { matrix[row * size + col] = bit; };
                for (let i = size - 1; i >= size - 7; i--) putB(8, i, (bits >> (14 - (size - 1 - i))) & 1);
                for (let i = size - 8; i < size; i++) putB(i, 8, (bits >> (14 - (7 + i - (size - 8)))) & 1);

                const [info, err] = readFormatInfo(matrix, size);
                expect(err).toBe(null);
                expect(info.eclBits).toBe(ecl);
                expect(info.maskId).toBe(mask);
            }
        }
    });

    it('readFormatInfo: corrects up to 3 corrupted bits per copy', () => {
        const size = 21;
        const bits = formatInfoBits(EC_LEVEL_BITS.H, 5);
        const matrix = new Uint8Array(size * size);

        // Write copy A and B
        for (let i = 0; i <= 5; i++) matrix[8 * size + i] = (bits >> (14 - i)) & 1;
        matrix[8 * size + 7] = (bits >> 8) & 1;
        matrix[8 * size + 8] = (bits >> 7) & 1;
        matrix[7 * size + 8] = (bits >> 6) & 1;
        for (let i = 5; i >= 0; i--) matrix[i * size + 8] = (bits >> (i)) & 1;

        for (let i = size - 1; i >= size - 7; i--) matrix[8 * size + i] = (bits >> (14 - (size - 1 - i))) & 1;
        for (let i = size - 8; i < size; i++) matrix[i * size + 8] = (bits >> (14 - (7 + i - (size - 8)))) & 1;

        // Corrupt 2 bits in copy A
        matrix[8 * size + 0] ^= 1;
        matrix[8 * size + 1] ^= 1;

        const [info, err] = readFormatInfo(matrix, size);
        expect(err).toBe(null);
        expect(info.eclBits).toBe(EC_LEVEL_BITS.H);
        expect(info.maskId).toBe(5);
    });

    it('applyMaskInverse: modifies non-reserved modules according to mask formulas', () => {
        const size = 21;
        const reserved = new Uint8Array(size * size);
        // Mark top-left 7x7 as reserved
        for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) reserved[r * size + c] = 1;

        for (let mask = 0; mask < 8; mask++) {
            const matrix = new Uint8Array(size * size);
            applyMaskInverse(matrix, reserved, size, mask);

            // Reserved region must remain untouched (all 0)
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 7; c++) {
                    expect(matrix[r * size + c]).toBe(0);
                }
            }

            // Non-reserved cell (8, 8): row=8, col=8
            // Mask 0: (8+8)%2 == 0 -> flip=true
            // Mask 1: 8%2 == 0 -> flip=true
            // Mask 2: 8%3 == 2 != 0 -> flip=false
            if (mask === 0 || mask === 1) {
                expect(matrix[8 * size + 8]).toBe(1);
            } else if (mask === 2) {
                expect(matrix[8 * size + 8]).toBe(0);
            }
        }
    });

    it('buildReservedMap: constructs accurate reserved function patterns', () => {
        expect(buildReservedMap(21, 0).length).toBe(0);
        expect(buildReservedMap(21, 16).length).toBe(0);

        // Version 1 (21x21)
        const v1 = buildReservedMap(21, 1);
        expect(v1.length).toBe(21 * 21);

        // Check finder centers are reserved
        expect(v1[3 * 21 + 3]).toBe(1); // TL finder
        expect(v1[3 * 21 + 17]).toBe(1); // TR finder
        expect(v1[17 * 21 + 3]).toBe(1); // BL finder

        // Check dark module (size-8, 8) = (13, 8)
        expect(v1[13 * 21 + 8]).toBe(1);

        // Version 7 (45x45) should include version information areas
        const v7 = buildReservedMap(45, 7);
        expect(v7.length).toBe(45 * 45);
        // Version strip: row 0, cols [45-11 .. 45-9] = cols [34 .. 36]
        expect(v7[0 * 45 + 34]).toBe(1);
        expect(v7[0 * 45 + 35]).toBe(1);
        expect(v7[0 * 45 + 36]).toBe(1);
        // Transpose: rows [34 .. 36], col 0
        expect(v7[34 * 45 + 0]).toBe(1);
        expect(v7[35 * 45 + 0]).toBe(1);
        expect(v7[36 * 45 + 0]).toBe(1);
    });

    it('negateBitmap: flips every pixel accurately and handles invalid input', () => {
        const invalid = negateBitmap(null);
        expect(invalid.bw.length).toBe(0);

        const img = { bw: new Uint8Array([1, 0, 1, 1, 0]), width: 5, height: 1 };
        const neg = negateBitmap(img);
        expect(Array.from(neg.bw)).toEqual([0, 1, 0, 0, 1]);
        expect(neg.width).toBe(5);
        expect(neg.height).toBe(1);
    });

    it('makeHomography: computes 4-point projective mapping with boundary validation', () => {
        expect(makeHomography(null, [])).toBe(null);
        expect(makeHomography([{ x: 0, y: 0 }], [{ x: 0, y: 0 }])).toBe(null);

        // Identity transform: unit square -> unit square
        const unit = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 }
        ];
        const M = makeHomography(unit, unit);
        expect(Array.isArray(M)).toBe(true);
        expect(M.length).toBe(3);
        // M should map (0.5, 0.5) to (0.5, 0.5)
        const den = M[2][0] * 0.5 + M[2][1] * 0.5 + M[2][2];
        const px = (M[0][0] * 0.5 + M[0][1] * 0.5 + M[0][2]) / den;
        const py = (M[1][0] * 0.5 + M[1][1] * 0.5 + M[1][2]) / den;
        expect(Math.abs(px - 0.5) < 0.001).toBe(true);
        expect(Math.abs(py - 0.5) < 0.001).toBe(true);
    });

    it('decodeWithCorners: accepts pre-located finder corners', () => {
        const payload = new TextEncoder().encode('otpauth://totp/corners?secret=JBSWY3DP');
        const m = encodeQR(payload);
        const img = synthesize(m, 4);
        const [corners] = findFindersRef((binarize(img))[0]);
        expect(corners !== null).toBe(true);

        const [res, err] = decodeWithCorners(img, corners);
        expect(err).toBe(null);
        expect(new TextDecoder().decode(res.bytes)).toBe('otpauth://totp/corners?secret=JBSWY3DP');

        // Invalid corners
        const [, errBad] = decodeWithCorners(img, null);
        expect(errBad instanceof Error).toBe(true);
    });

    it('findFindersRef & findAlignment: defensive parameter validation', () => {
        const [, errF] = findFindersRef(null);
        expect(errF instanceof Error).toBe(true);
        expect(errF.message).toBe('qr: invalid binary image for finder search');

        const [, errA] = findAlignment(null, null);
        expect(errA instanceof Error).toBe(true);
        expect(errA.message).toBe('qr: invalid alignment estimation parameters');
    });
});

describe('QR Metamorphic Relations & Invariants', () => {
    it('MR: double negation is identity on bitmaps (negate(negate(img)) ≡ img)', () => {
        const img = {
            bw: new Uint8Array([0, 1, 1, 0, 1, 0, 0, 1]),
            width: 4,
            height: 2
        };
        const doubleNeg = negateBitmap(negateBitmap(img));
        expect(Array.from(doubleNeg.bw)).toEqual(Array.from(img.bw));
        expect(doubleNeg.width).toBe(img.width);
        expect(doubleNeg.height).toBe(img.height);
    });

    it('MR: mask application is an involution (applyMask(applyMask(M, m), m) ≡ M)', () => {
        const size = 25;
        const reserved = new Uint8Array(size * size);
        for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) reserved[r * size + c] = 1;

        const original = new Uint8Array(size * size);
        for (let i = 0; i < original.length; i++) original[i] = (i * 17) & 1;

        for (let mask = 0; mask < 8; mask++) {
            const matrix = Uint8Array.from(original);
            applyMaskInverse(matrix, reserved, size, mask);
            applyMaskInverse(matrix, reserved, size, mask);
            expect(Array.from(matrix)).toEqual(Array.from(original));
        }
    });

    it('MR: decode succeeds on dark-theme captures (white-on-black polarity)', () => {
        const uri = 'otpauth://totp/darktheme?secret=JBSWY3DPEHPK3PXP';
        const m = encodeQR(new TextEncoder().encode(uri));
        const quiet = 4;
        const scale = 4;
        const dim = (m.size + quiet * 2) * scale;
        const data = new Uint8ClampedArray(dim * dim * 4).fill(0); // dark background
        // Draw light modules as bright white
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c < m.size; c++) {
                if (m.modules[r * m.size + c]) continue;
                for (let py = 0; py < scale; py++) {
                    for (let px = 0; px < scale; px++) {
                        const y = (r + quiet) * scale + py;
                        const x = (c + quiet) * scale + px;
                        const i = (y * dim + x) * 4;
                        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
                    }
                }
            }
        }
        // Quiet zone is bright
        for (let y = 0; y < dim; y++) {
            for (let x = 0; x < dim; x++) {
                const mr = Math.floor(y / scale) - quiet;
                const mc = Math.floor(x / scale) - quiet;
                if (mr < 0 || mr >= m.size || mc < 0 || mc >= m.size) {
                    const i = (y * dim + x) * 4;
                    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
                }
            }
        }
        const [result, err] = decodeQR({ data, width: dim, height: dim });
        expect(err).toBe(null);
        expect(new TextDecoder().decode(result.bytes)).toBe(uri);
    });
});
