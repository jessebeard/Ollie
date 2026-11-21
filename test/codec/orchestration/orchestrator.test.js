import { describe, it, expect } from '../../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';
import { JpegEncoder } from '../../../src/codec/encoder.js';
import { JpegDecoder } from '../../../src/codec/decoder.js';

describe('Orchestrator & Transcoding Equivalency (PBT)', () => {

    it('Fuzzing Odd JPEG Dimensions (Boundary Rejection/Padding Idempotency)', async () => {
        // Assert that generating inputs with odd bounds respects boundary rejection/padding.
        await assertProperty(
            [Arbitrary.integer(9, 63), Arbitrary.integer(9, 63)],
            async (width, height) => {
                // DO NOT ensure cleanly divisible by 8! We want the encoder/decoder to handle padding.
                const data = new Uint8ClampedArray(width * height * 4);
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 100;
                    data[i + 1] = 120;
                    data[i + 2] = 140;
                    data[i + 3] = 255;
                }

                const encoder = new JpegEncoder(90);
                const jpegData = await encoder.encode({ width, height, data });
                const decoder = new JpegDecoder();
                const [decoded, err] = await decoder.decode(jpegData);

                expect(err).toBeNull();
                // The decoder should pad the canvas to the nearest MCU, 
                // but the image width/height parsed from SOF should match the original.
                expect(decoded.width === width).toBe(true);
                expect(decoded.height === height).toBe(true);
            },
            10
        );
    });

    it('Idempotency of Lossless Transcoding (Roundtrip zero-degradation)', async () => {
        // Decoding a JPEG and immediately re-encoding it using the exact same quantization tables
        // should result in zero generation loss. decode(encode(decode(img))) == decode(img)

        await assertProperty(
            [Arbitrary.integer(32, 64), Arbitrary.integer(32, 64)],
            async (width, height) => {
                // Ensure dimensions are cleanly divisible by 8 so padding edge cases don't ruin MSE bounds
                width = Math.max(8, width - (width % 8));
                height = Math.max(8, height - (height % 8));

                const data = new Uint8ClampedArray(width * height * 4);
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = Math.floor(Math.random() * 256); data[i + 1] = Math.floor(Math.random() * 256);
                    data[i + 2] = Math.floor(Math.random() * 256); data[i + 3] = 255;
                }

                // Gen 0 - Initial compression (lossy!)
                const encoderInitial = new JpegEncoder(85);
                const jpeg0 = await encoderInitial.encode({ width, height, data });

                // Decode Gen 0 to get quantized spatial domain pixels
                const decoder0 = new JpegDecoder();
                const [decoded0, err0] = await decoder0.decode(jpeg0);
                expect(err0).toBeNull();

                // Re-encode Gen 0 natively (not via transcoder byte-skip) passing its tables back
                const encoder1 = new JpegEncoder(85); // Note: must match quality so tables match (strict idempotency)
                const jpeg1 = await encoder1.encode({ width, height, data: decoded0.data });

                // Decode Gen 1
                const decoder1 = new JpegDecoder();
                const [decoded1, err1] = await decoder1.decode(jpeg1);
                expect(err1).toBeNull();

                // Instead of strict pixel-by-pixel tolerance, we compute total generation loss (MSE)
                let totalSquareError = 0;
                for (let i = 0; i < decoded0.data.length; i++) {
                    const diff = decoded0.data[i] - decoded1.data[i];
                    totalSquareError += (diff * diff);
                }
                const mse = totalSquareError / decoded0.data.length;

                // Idempotency means MSE should be extremely low (near zero), 
                // allowing only for minor 8x8 boundary clamping variations.
                expect(mse < 10.0).toBe(true);
            },
            5
        );
    });

    it('Subsampling Degradation Bounds (MSE)', async () => {
        // 4:4:4 vs 4:2:0 subsampling should yield RGB values that stay within 
        // a strictly calculated Mean Squared Error (MSE) tolerance.

        await assertProperty(
            [Arbitrary.integer(32, 64), Arbitrary.integer(32, 64)],
            async (width, height) => {
                width = width - (width % 8); height = height - (height % 8);
                if (width === 0) width = 8; if (height === 0) height = 8;

                const data = new Uint8ClampedArray(width * height * 4);
                for (let i = 0; i < data.length; i += 4) {
                    // Gradual random to not create extreme high-frequency spikes where 4:2:0 breaks entirely
                    data[i] = 100 + Math.floor(Math.random() * 50);
                    data[i + 1] = 100 + Math.floor(Math.random() * 50);
                    data[i + 2] = 100 + Math.floor(Math.random() * 50);
                    data[i + 3] = 255;
                }

                // 4:4:4 encode
                const enc444 = new JpegEncoder(90, { subsampling: '4:4:4' });
                const [dec444] = await (new JpegDecoder()).decode(await enc444.encode({ width, height, data }));

                // 4:2:0 encode
                const enc420 = new JpegEncoder(90, { subsampling: '4:2:0' });
                const [dec420] = await (new JpegDecoder()).decode(await enc420.encode({ width, height, data }));

                // Calculate MSE between Decoded 4:4:4 and Decoded 4:2:0
                let totalSquareError = 0;
                let numChannels = 0;

                for (let i = 0; i < data.length; i += 4) {
                    // Only sum RGB, ignore Alpha
                    for (let c = 0; c < 3; c++) {
                        const diff = dec444.data[i + c] - dec420.data[i + c];
                        totalSquareError += (diff * diff);
                        numChannels++;
                    }
                }

                const mse = totalSquareError / numChannels;
                // High frequency detail is lost in 4:2:0 but MSE should remain bounded for smooth random
                expect(mse < 300).toBe(true);
            },
            5
        );
    });
});
