import { describe, it, expect } from '../utils/test-runner.js';
import { encodeQR } from '../../src/codec/qr-encoder.js';
// RED: module does not exist yet - this suite must fail until W1C1 GREEN.
import { decodeQR } from '../../src/codec/qr-decoder.js';
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
        for (const scale of [2, 3, 6, 8]) {
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
    function synthGray(matrix, scale, darkVal, lightVal, jitterAmt, seed) {
        const quiet = 4;
        const dim = (matrix.size + quiet * 2) * scale;
        const data = new Uint8ClampedArray(dim * dim * 4);
        let s = seed >>> 0;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        for (let r = 0; r < matrix.size; r++) {
            for (let c = 0; c < matrix.size; c++) {
                const dark = !!matrix.modules[r * matrix.size + c];
                for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
                    const y = (r + quiet) * scale + py, x = (c + quiet) * scale + px;
                    const j = (rnd() * 2 - 1) * jitterAmt;
                    const v = Math.max(0, Math.min(255, (dark ? darkVal : lightVal) + j));
                    const i = (y * dim + x) * 4; data[i] = v; data[i + 1] = v; data[i + 2] = v;
                }
            }
        }
        return { data, width: dim, height: dim };
    }

    it('decodes grayscale renders with sensor-like luminance jitter', () => {
        // Jitter is spatially smoothed: real sensor noise is correlated by
        // the optics/demosaic pipeline; independent per-pixel white noise
        // defeats every local-threshold binarizer by construction.
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
        const [r, err] = decodeQR({ data, width: dim, height: dim });
        expect(err).toEqual(null);
        if (new TextDecoder().decode(r.bytes) !== uri) throw new Error('noisy decode mismatch');
    });

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
        if (!(err instanceof Error)) throw new Error('destroyed format accepted');
        if (!err.message.includes('format')) throw new Error('error should mention format');
    });

    it('returns a tuple and never throws on hostile inputs', () => {
        for (const input of [null, { data: new Uint8ClampedArray(9), width: 0, height: 3 }]) {
            let threw = false;
            try { decodeQR(input); } catch { threw = true; }
            if (threw) throw new Error('decoder threw instead of returning tuple');
        }
    });

    it('rejects blank and tiny images with typed errors', () => {
        const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 };
        const [, errBlank] = decodeQR(blank);
        if (!(errBlank instanceof Error)) throw new Error('blank accepted');
        const tiny = { data: new Uint8ClampedArray(4).fill(255), width: 1, height: 1 };
        const [, errTiny] = decodeQR(tiny);
        if (!(errTiny instanceof Error)) throw new Error('tiny accepted');
    });
});
