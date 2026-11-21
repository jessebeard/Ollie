import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';

describe('Codec Dedicated PBT Suite', () => {
    it('Property: JpegEncoder -> JpegDecoder preserves exact dimensions and pixel fidelity across arbitrary 8-multiple image sizes', async () => {
        await assertProperty(
            [Arbitrary.integer(1, 4), Arbitrary.integer(1, 4), Arbitrary.integer(50, 95)],
            async (blocksW, blocksH, quality) => {
                const width = blocksW * 8;
                const height = blocksH * 8;
                const data = new Uint8ClampedArray(width * height * 4);

                for (let i = 0; i < data.length; i += 4) {
                    data[i] = (i * 17) % 256;
                    data[i + 1] = (i * 31) % 256;
                    data[i + 2] = (i * 53) % 256;
                    data[i + 3] = 255;
                }

                const img = { width, height, data };
                const encoder = new JpegEncoder(quality, { subsampling: '4:4:4' });
                const encoded = await encoder.encode(img);
                expect(encoded instanceof Uint8Array).toBe(true);

                const decoder = new JpegDecoder();
                const [decoded, decErr] = await decoder.decode(encoded);
                expect(decErr).toBe(null);
                expect(decoded.width).toBe(width);
                expect(decoded.height).toBe(height);
                expect(decoded.data.length).toBe(width * height * 4);

                // Pixel fidelity check: verify decoded image preserves channel DC luminance and is not blank
                let origSumR = 0, origSumG = 0, origSumB = 0;
                let decSumR = 0, decSumG = 0, decSumB = 0;
                const pixelCount = width * height;

                for (let i = 0; i < data.length; i += 4) {
                    origSumR += data[i];
                    origSumG += data[i + 1];
                    origSumB += data[i + 2];

                    decSumR += decoded.data[i];
                    decSumG += decoded.data[i + 1];
                    decSumB += decoded.data[i + 2];
                }

                // Average channel luminance (DC component) must be preserved within quantization error (<= 6)
                expect(Math.abs(origSumR / pixelCount - decSumR / pixelCount)).toBeLessThanOrEqual(6);
                expect(Math.abs(origSumG / pixelCount - decSumG / pixelCount)).toBeLessThanOrEqual(6);
                expect(Math.abs(origSumB / pixelCount - decSumB / pixelCount)).toBeLessThanOrEqual(6);

                // Pixel array must contain active rendered pixels (not wiped or all-zero)
                let activePixels = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (decoded.data[i] > 0 || decoded.data[i + 1] > 0 || decoded.data[i + 2] > 0) {
                        activePixels++;
                    }
                }
                expect(activePixels).toBe(pixelCount);
            },
            30
        );
    });

    it('Property: higher JPEG quality monotonically preserves or increases encoded file size on textured blocks', async () => {
        await assertProperty(
            [Arbitrary.integer(2, 5), Arbitrary.integer(20, 45), Arbitrary.integer(65, 95)],
            async (blockCount, qLow, qHigh) => {
                const size = blockCount * 8;
                const data = new Uint8ClampedArray(size * size * 4);
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = (i * 23 + qLow) % 256;
                    data[i + 1] = (i * 47 + qHigh) % 256;
                    data[i + 2] = (i * 89) % 256;
                    data[i + 3] = 255;
                }
                const img = { width: size, height: size, data };

                const low = await new JpegEncoder(qLow).encode(img);
                const high = await new JpegEncoder(qHigh).encode(img);

                expect(high.length).toBeGreaterThanOrEqual(low.length);
            },
            25
        );
    });

    it('Property: JpegEncoder output always starts with SOI marker (0xFFD8) and ends with EOI marker (0xFFD9)', async () => {
        await assertProperty(
            [Arbitrary.integer(20, 80)],
            async (quality) => {
                const img = {
                    width: 8,
                    height: 8,
                    data: new Uint8ClampedArray(8 * 8 * 4).fill(128)
                };
                const bytes = await new JpegEncoder(quality).encode(img);

                expect(bytes[0]).toBe(0xFF);
                expect(bytes[1]).toBe(0xD8);
                expect(bytes[bytes.length - 2]).toBe(0xFF);
                expect(bytes[bytes.length - 1]).toBe(0xD9);
            },
            25
        );
    });
});
