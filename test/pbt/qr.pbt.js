import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
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

describe('QR Dedicated PBT Suite', () => {
    it('Property: encodeQR produces symbols obeying ISO 18004 dimension formula (17 + 4 * version)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 40)],
            (payload) => {
                const qr = encodeQR(payload);
                expect((qr.size - 17) % 4).toBe(0);
                expect(qr.size).toBeGreaterThanOrEqual(21);
                expect(qr.modules.length).toBe(qr.size * qr.size);

                // Modules must be strictly 0 or 1
                const allBinary = qr.modules.every(m => m === 0 || m === 1);
                expect(allBinary).toBe(true);

                // Top-left finder pattern corner must be black (1)
                expect(qr.modules[0]).toBe(1);
            },
            40
        );
    });

    it('Property: QR encode -> synthesize -> decode roundtrip recovers arbitrary byte payloads across Versions 1-5', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 80)],
            (payload) => {
                const matrix = encodeQR(payload);
                const image = synthesize(matrix, 2);

                const [result, err] = decodeQR(image);
                expect(err).toBe(null);
                expect(result).toBeDefined();
                expect(Array.from(result.bytes)).toEqual(Array.from(payload));
            },
            30
        );
    });

    it('Property: QR binarizer converts arbitrary RGBA buffers to exact dimensions without throwing', async () => {
        await assertProperty(
            [Arbitrary.integer(16, 32), Arbitrary.integer(16, 32)],
            (w, h) => {
                const data = new Uint8ClampedArray(w * h * 4);
                for (let i = 0; i < data.length; i++) data[i] = (i * 19) % 256;

                const [bin, err] = binarize({ data, width: w, height: h });
                expect(err).toBe(null);
                expect(bin.width).toBe(w);
                expect(bin.height).toBe(h);
                expect(bin.bw.length).toBe(w * h);

                // Output pixels must strictly be thresholded binary values (0 or 1)
                const allBinary = bin.bw.every(p => p === 0 || p === 1);
                expect(allBinary).toBe(true);
            },
            30
        );
    });
});
