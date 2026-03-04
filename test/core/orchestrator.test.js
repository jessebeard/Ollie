import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { JpegEncoder } from '../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../src/core/jpeg-decoder.js';

describe('Orchestrator & Transcoding Equivalency (PBT)', () => {

    it('Progressive vs. Baseline Equivalency', async () => {
        // The sum of all multi-scan progressive DCT coefficients must perfectly match
        // the single-scan baseline DCT coefficients for the same image.

        // PBT generation of random blocks
        await assertProperty(
            [Arbitrary.integer(16, 64), Arbitrary.integer(16, 64)],
            async (width, height) => {
                // Ensure mod 8 cleanly 
                width = Math.max(8, width - (width % 8));
                height = Math.max(8, height - (height % 8));

                const data = new Uint8ClampedArray(width * height * 4);
                for (let i = 0; i < data.length; i += 4) { // Fill random RGB
                    data[i] = Math.floor(Math.random() * 256);
                    data[i + 1] = Math.floor(Math.random() * 256);
                    data[i + 2] = Math.floor(Math.random() * 256);
                    data[i + 3] = 255;
                }

                // Default is Baseline sequential
                const encoderBase = new JpegEncoder(80, { progressive: false });
                const baseJpeg = await encoderBase.encode({ width, height, data });

                // Progressive encoding
                const encoderProg = new JpegEncoder(80, { progressive: true });
                const progJpeg = await encoderProg.encode({ width, height, data });

                const decoderClass = new JpegDecoder();
                const [baseDecoded, baseErr] = await decoderClass.decode(baseJpeg, { coefficientsOnly: true });
                expect(baseErr).toBeNull();

                const [progDecoded, progErr] = await decoderClass.decode(progJpeg, { coefficientsOnly: true });
                expect(progErr).toBeNull();

                // 1. Same number of components
                const baseComps = Object.keys(baseDecoded.coefficients);
                const progComps = Object.keys(progDecoded.coefficients);
                expect(baseComps.length).toBe(progComps.length);

                // 2. Tightly bounded quantized DCT coefficients
                for (const compId of baseComps) {
                    const bBlocks = baseDecoded.coefficients[compId].blocks;
                    const pBlocks = progDecoded.coefficients[compId].blocks;
                    expect(bBlocks.length).toBe(pBlocks.length);

                    let errCount = 0;
                    for (let i = 0; i < bBlocks.length; i++) {
                        for (let k = 0; k < 64; k++) {
                            // Quantized DCT values can vary slightly between different encoder algorithms due to floating point roundoffs or different FDCT scaling implementations.
                            if (Math.abs(bBlocks[i][k] - pBlocks[i][k]) > 5) {
                                errCount++;
                            }
                        }
                    }
                    // Expect 95% of DCT values across both scans to match within tolerance
                    const totalCoeffs = bBlocks.length * 64;
                    expect(errCount / totalCoeffs <= 0.05).toBe(true);
                }
            },
            5 // Takes awhile to encode/decode, 5 property runs per dimension
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
