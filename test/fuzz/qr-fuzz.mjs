import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { encodeQR } from '../../src/codec/qr-encoder.js';
import { decodeQR, binarize } from '../../src/codec/qr-decoder.js';

function synthesize(matrix, scale = 2) {
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

/**
 * QR Code Fuzz Suite: Encoder dimensions, synthesize+decode roundtrips,
 * binarizer robustness, and corrupted matrix rejection.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runQrFuzz(scale = 1) {
    const iters = Math.max(10, Math.floor(20 * scale));

    // 1. Full encode -> synthesize -> decode roundtrip over arbitrary byte payloads
    await assertProperty(
        [Arbitrary.byteArray(1, 30)],
        async (payload) => {
            const matrix = encodeQR(payload);
            const image = synthesize(matrix, 2);

            const [result, err] = decodeQR(image);
            if (err) throw err;
            if (!result || !result.bytes) throw new Error('Missing result bytes');

            if (result.bytes.length !== payload.length) {
                throw new Error(`Payload length mismatch: expected ${payload.length}, got ${result.bytes.length}`);
            }
            for (let i = 0; i < payload.length; i++) {
                if (result.bytes[i] !== payload[i]) {
                    throw new Error(`QR byte mismatch at index ${i}`);
                }
            }
        },
        iters
    );

    // 2. Binarizer robustness against random RGBA pixel data
    await assertProperty(
        [Arbitrary.integer(8, 32), Arbitrary.integer(8, 32)],
        async (w, h) => {
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < data.length; i++) {
                data[i] = (i * 31) % 256;
            }

            const [res, err] = binarize({ data, width: w, height: h });
            if (err) {
                if (!(err instanceof Error)) throw new Error('Expected Error instance');
            } else {
                if (res.width !== w || res.height !== h || res.bw.length !== w * h) {
                    throw new Error('Binarized dimensions mismatch');
                }
            }
        },
        iters
    );

    // 3. Corrupted image input to decodeQR fails safely with typed error
    const blank = {
        data: new Uint8ClampedArray(64 * 64 * 4).fill(255),
        width: 64,
        height: 64
    };
    const [blankRes, blankErr] = decodeQR(blank);
    if (blankRes !== null || !blankErr) {
        throw new Error('Blank image did not produce typed error in decodeQR');
    }
}
