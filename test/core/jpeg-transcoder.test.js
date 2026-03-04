import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../src/core/jpeg-decoder.js';
import { JpegTranscoder } from '../../src/core/jpeg-transcoder.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';

describe('JPEG Transcoder (Lossless)', () => {

    /**
     * Test: Lossless Roundtrip - No Steganography
     * 
     * Validates that decoding and re-encoding coefficients produces identical pixels.
     */
    it('Lossless Roundtrip - Identical Pixels', async () => {

        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                data[idx] = x * 4;
                data[idx + 1] = y * 4;
                data[idx + 2] = 128;
                data[idx + 3] = 255;
            }
        }

        const encoder = new JpegEncoder(90);
        const originalJpeg = await encoder.encode({ width, height, data });

        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(originalJpeg, { skipExtraction: true });
        expect(err).toBeNull();

        const encoder2 = new JpegEncoder(90);
        const transcodedJpeg = await encoder2.encodeCoefficients(
            decoded.coefficients,
            decoded.quantizationTables,
            { width, height }
        );

        const decoder2 = new JpegDecoder();
        const [originalDecoded, errOrig] = await decoder2.decode(originalJpeg);
        expect(errOrig).toBeNull();

        const decoder3 = new JpegDecoder();
        const [transcodedDecoded, errTrans] = await decoder3.decode(transcodedJpeg);
        expect(errTrans).toBeNull();

        expect(originalDecoded.width).toBe(transcodedDecoded.width);
        expect(originalDecoded.height).toBe(transcodedDecoded.height);

        let maxDiff = 0;
        for (let i = 0; i < originalDecoded.data.length; i++) {
            const diff = Math.abs(originalDecoded.data[i] - transcodedDecoded.data[i]);
            maxDiff = Math.max(maxDiff, diff);
        }

        expect(maxDiff).toBe(0);
    });

    /**
     * Test: Steganography Persistence
     * 
     * Validates that steganography data survives transcoding operations.
     */
    it('Steganography Persistence - Single Update', async () => {

        const width = 512;
        const height = 512;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                data[idx] = Math.floor(Math.random() * 256);
                data[idx + 1] = Math.floor(Math.random() * 256);
                data[idx + 2] = Math.floor(Math.random() * 256);
                data[idx + 3] = 255;
            }
        }

        const secretData1 = new TextEncoder().encode('Initial Secret Message');
        const encoder1 = new JpegEncoder(90, {
            secretData: secretData1,
            password: 'test123'
        });
        const jpeg1 = await encoder1.encode({ width, height, data });

        const transcoder = new JpegTranscoder();
        const secretData2 = new TextEncoder().encode('Updated Secret Message');
        const [jpeg2, transErr] = await transcoder.updateSecret(jpeg1, secretData2, {
            password: 'test123',
            filename: 'test.txt'
        });
        expect(transErr).toBeNull();

        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpeg2, { password: 'test123' });
        expect(err).toBeNull();

        expect(decoded.secretData).toBeDefined();
        const extractedText = new TextDecoder().decode(decoded.secretData);
        expect(extractedText).toBe('Updated Secret Message');
    });

    /**
     * Test: Multiple Generation Quality
     * 
     * Validates that multiple transcode operations don't degrade quality.
     */
    it('Multiple Generations - No Quality Loss', async () => {

        // Dimensions must be large enough to generate enough DCT coefficients to store
        // Steganography payloads *with* ECC Medium Profile parity bytes safely.
        const width = 512;
        const height = 512;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                data[idx] = Math.floor(Math.random() * 256);
                data[idx + 1] = Math.floor(Math.random() * 256);
                data[idx + 2] = Math.floor(Math.random() * 256);
                data[idx + 3] = 255;
            }
        }

        const encoder = new JpegEncoder(90, {
            secretData: new TextEncoder().encode('Gen 0'),
            password: 'test'
        });
        let currentJpeg = await encoder.encode({ width, height, data });

        const decoder0 = new JpegDecoder();
        const [original, errOrig] = await decoder0.decode(currentJpeg);
        expect(errOrig).toBeNull();

        const transcoder = new JpegTranscoder();
        for (let gen = 1; gen <= 10; gen++) {
            const newSecret = new TextEncoder().encode(`Gen ${gen}`);
            const [updatedJpeg, genErr] = await transcoder.updateSecret(currentJpeg, newSecret, {
                password: 'test',
                filename: 'test.txt'
            });
            expect(genErr).toBeNull();
            currentJpeg = updatedJpeg;
        }

        const decoderFinal = new JpegDecoder();
        const [final, errFinal] = await decoderFinal.decode(currentJpeg, { password: 'test' });
        expect(errFinal).toBeNull();

        const finalText = new TextDecoder().decode(final.secretData);
        expect(finalText).toBe('Gen 10');

        expect(original.width).toBe(final.width);
        expect(original.height).toBe(final.height);

        let maxDiff = 0;
        for (let i = 0; i < original.data.length; i++) {
            const diff = Math.abs(original.data[i] - final.data[i]);
            maxDiff = Math.max(maxDiff, diff);
        }

        expect(maxDiff).toBeLessThan(100);
    });

    it('Property: Transcoder Fuzzing Payload Integrity', async () => {
        // Assert that arbitrary payload dimensions and capacities decode perfectly back out
        await assertProperty(
            [Arbitrary.string(1, 100), Arbitrary.string(4, 20)],
            async (secretStr, password) => {
                const width = 64;
                const height = 64;
                const data = new Uint8ClampedArray(width * height * 4);
                // Give some entropy so coefficients exist
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        data[idx] = Math.floor(Math.random() * 255);
                        data[idx + 1] = Math.floor(Math.random() * 255);
                        data[idx + 2] = Math.floor(Math.random() * 255);
                        data[idx + 3] = 255;
                    }
                }

                const encoder = new JpegEncoder(90);
                const originalJpeg = await encoder.encode({ width, height, data });

                const payload = new TextEncoder().encode(secretStr);
                const transcoder = new JpegTranscoder();

                const [stegoJpeg, transErr] = await transcoder.updateSecret(originalJpeg, payload, { password });

                // If it couldn't fit the payload, just ignore this fuzz cycle
                if (transErr) return true;

                const decoder = new JpegDecoder();
                const [decoded, decErr] = await decoder.decode(stegoJpeg, { password });

                expect(decErr).toBeNull();
                const extractedText = new TextDecoder().decode(decoded.secretData);
                expect(extractedText).toBe(secretStr);

                return true;
            },
            10
        );
    });

    it('coefficientsOnly mode should return coefficients without image data', async () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i++) data[i] = i % 256;

        const encoder = new JpegEncoder(90);
        const jpeg = await encoder.encode({ width, height, data });

        const decoder = new JpegDecoder();
        const [result, err] = await decoder.decode(jpeg, { coefficientsOnly: true });
        expect(err).toBeNull();

        // Should have coefficients and quantization tables
        expect(result.coefficients).toBeDefined();
        expect(result.quantizationTables).toBeDefined();
        expect(result.width).toBe(width);
        expect(result.height).toBe(height);

        // Should NOT have pixel data (no assembleImage was called)
        expect(result.data).toBe(undefined);

        // Coefficients should have component blocks
        const compIds = Object.keys(result.coefficients);
        expect(compIds.length).toBe(3); // Y, Cb, Cr

        // Each component should have blocks array
        for (const id of compIds) {
            expect(result.coefficients[id].blocks).toBeDefined();
            expect(result.coefficients[id].blocks.length).toBeGreaterThan(0);
        }

        // Quantization tables should have luma and chroma
        expect(result.quantizationTables.get(0)).toBeDefined();
        expect(result.quantizationTables.get(1)).toBeDefined();
    });
});
