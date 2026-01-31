import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../src/core/jpeg-decoder.js';
import { JpegTranscoder } from '../../src/core/jpeg-transcoder.js';

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
        const decoded = await decoder.decode(originalJpeg, { skipExtraction: true });

        const encoder2 = new JpegEncoder(90);
        const transcodedJpeg = await encoder2.encodeCoefficients(
            decoded.coefficients,
            decoded.quantizationTables,
            { width, height }
        );

        const decoder2 = new JpegDecoder();
        const originalDecoded = await decoder2.decode(originalJpeg);

        const decoder3 = new JpegDecoder();
        const transcodedDecoded = await decoder3.decode(transcodedJpeg);

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

        const width = 256;
        const height = 256;
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
        const jpeg2 = await transcoder.updateSecret(jpeg1, secretData2, {
            password: 'test123',
            filename: 'test.txt'
        });

        const decoder = new JpegDecoder();
        const decoded = await decoder.decode(jpeg2, { password: 'test123' });

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

        const width = 256;
        const height = 256;
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
        const original = await decoder0.decode(currentJpeg);

        const transcoder = new JpegTranscoder();
        for (let gen = 1; gen <= 10; gen++) {
            const newSecret = new TextEncoder().encode(`Gen ${gen}`);
            currentJpeg = await transcoder.updateSecret(currentJpeg, newSecret, {
                password: 'test',
                filename: 'test.txt'
            });
        }

        const decoderFinal = new JpegDecoder();
        const final = await decoderFinal.decode(currentJpeg, { password: 'test' });

        const finalText = new TextDecoder().decode(final.secretData);
        expect(finalText).toBe('Gen 10');

        expect(original.width).toBe(final.width);
        expect(original.height).toBe(final.height);

        let maxDiff = 0;
        for (let i = 0; i < original.data.length; i++) {
            const diff = Math.abs(original.data[i] - final.data[i]);
            maxDiff = Math.max(maxDiff, diff);
        }

        expect(maxDiff).toBe(0);
    });
});
