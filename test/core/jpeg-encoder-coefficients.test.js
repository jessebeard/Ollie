import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../src/core/jpeg-decoder.js';
import { JpegTranscoder } from '../../src/core/jpeg-transcoder.js';

describe('JPEG Encoder - Coefficient Encoding', () => {
    /**
     * Test: Basic Coefficient Encoding
     * 
     * Validates that encoding from coefficients works.
     */
    it('Encode from Coefficients - Basic', async () => {

        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = 128;
            data[i + 1] = 128;
            data[i + 2] = 128;
            data[i + 3] = 255;
        }

        const encoder1 = new JpegEncoder(90);
        const jpeg1 = await encoder1.encode({ width, height, data });

        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpeg1, { skipExtraction: true });
        expect(err).toBeNull();

        expect(decoded.coefficients).toBeDefined();
        expect(decoded.quantizationTables).toBeDefined();

        const encoder2 = new JpegEncoder(90);
        const jpeg2 = await encoder2.encodeCoefficients(
            decoded.coefficients,
            decoded.quantizationTables,
            { width, height }
        );

        expect(jpeg2).toBeDefined();
        expect(jpeg2.length).toBeGreaterThan(0);

        expect(jpeg2[0]).toBe(0xFF);
        expect(jpeg2[1]).toBe(0xD8);
        expect(jpeg2[jpeg2.length - 2]).toBe(0xFF);
        expect(jpeg2[jpeg2.length - 1]).toBe(0xD9);
    });

    /**
     * Test: Coefficient Encoding with 4:2:0 Subsampling
     */
    it('Encode from Coefficients - 4:2:0 Subsampling', async () => {

        const width = 128;
        const height = 128;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                data[idx] = x * 2;
                data[idx + 1] = y * 2;
                data[idx + 2] = 128;
                data[idx + 3] = 255;
            }
        }

        const encoder1 = new JpegEncoder(90);
        const jpeg1 = await encoder1.encode({ width, height, data });

        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpeg1, { skipExtraction: true });
        expect(err).toBeNull();

        const encoder2 = new JpegEncoder(90);
        const jpeg2 = await encoder2.encodeCoefficients(
            decoded.coefficients,
            decoded.quantizationTables,
            { width, height }
        );

        const decoder2 = new JpegDecoder();
        const [original, errOrig] = await decoder2.decode(jpeg1);
        expect(errOrig).toBeNull();

        const decoder3 = new JpegDecoder();
        const [transcoded, errTrans] = await decoder3.decode(jpeg2);
        expect(errTrans).toBeNull();

        expect(original.width).toBe(transcoded.width);
        expect(original.height).toBe(transcoded.height);

        let differences = 0;
        for (let i = 0; i < original.data.length; i++) {
            if (original.data[i] !== transcoded.data[i]) {
                differences++;
            }
        }

        expect(differences).toBe(0);
    });

    /**
     * Test: Coefficient Encoding Preserves Component Structure
     */
    it('Encode from Coefficients - Preserves Component Structure', async () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = 200;
            data[i + 1] = 100;
            data[i + 2] = 50;
            data[i + 3] = 255;
        }

        const encoder1 = new JpegEncoder(90);
        const jpeg1 = await encoder1.encode({ width, height, data });

        const decoder1 = new JpegDecoder();
        const [decoded1, err1] = await decoder1.decode(jpeg1, { skipExtraction: true });
        expect(err1).toBeNull();

        expect(decoded1.coefficients[1]).toBeDefined();
        expect(decoded1.coefficients[2]).toBeDefined();
        expect(decoded1.coefficients[3]).toBeDefined();

        const comp1Blocks = decoded1.coefficients[1].blocks.length;
        const comp2Blocks = decoded1.coefficients[2].blocks.length;
        const comp3Blocks = decoded1.coefficients[3].blocks.length;

        const encoder2 = new JpegEncoder(90);
        const jpeg2 = await encoder2.encodeCoefficients(
            decoded1.coefficients,
            decoded1.quantizationTables,
            { width, height }
        );

        const decoder2 = new JpegDecoder();
        const [decoded2, err2] = await decoder2.decode(jpeg2, { skipExtraction: true });
        expect(err2).toBeNull();

        expect(decoded2.coefficients[1].blocks.length).toBe(comp1Blocks);
        expect(decoded2.coefficients[2].blocks.length).toBe(comp2Blocks);
        expect(decoded2.coefficients[3].blocks.length).toBe(comp3Blocks);
    });
});
