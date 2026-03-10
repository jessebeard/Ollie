/**
 * Tests for 4:2:0 chroma subsampling in JpegEncoder
 */
import { describe, it, expect } from '../utils/test-runner.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';

describe('JPEG Encoder - 4:2:0 Subsampling', () => {
    /**
     * Test: 4:2:0 encoding produces smaller files
     */
    it('4:2:0 produces smaller files than 4:4:4', async () => {
        const width = 128;
        const height = 128;
        const data = new Uint8ClampedArray(width * height * 4);

        // Create a gradient image
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                data[idx] = x * 2;
                data[idx + 1] = y * 2;
                data[idx + 2] = 128;
                data[idx + 3] = 255;
            }
        }

        // Encode with 4:4:4
        const encoder444 = new JpegEncoder(80);
        const jpeg444 = await encoder444.encode({ width, height, data });

        // Encode with 4:2:0
        const encoder420 = new JpegEncoder(80, { subsampling: '4:2:0' });
        const jpeg420 = await encoder420.encode({ width, height, data });

        console.log(`4:4:4 size: ${jpeg444.length}, 4:2:0 size: ${jpeg420.length}`);

        // 4:2:0 should be smaller (fewer chroma blocks)
        expect(jpeg420.length).toBeLessThan(jpeg444.length);
    });

    /**
     * Test: 4:2:0 SOF marker has correct sampling factors
     */
    it('4:2:0 SOF has correct sampling factors', async () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4).fill(128);

        const encoder = new JpegEncoder(80, { subsampling: '4:2:0' });
        const jpeg = await encoder.encode({ width, height, data });

        // Find SOF0 marker
        let sofOffset = -1;
        for (let i = 0; i < jpeg.length - 1; i++) {
            if (jpeg[i] === 0xFF && jpeg[i + 1] === 0xC0) {
                sofOffset = i + 2; // Skip marker
                break;
            }
        }

        expect(sofOffset).toBeGreaterThan(0);

        // Skip length (2), precision (1), height (2), width (2), numComponents (1)
        const componentsOffset = sofOffset + 2 + 1 + 2 + 2 + 1;

        // Y component: ID=1, sampling=0x22 (2x2), quantTable=0
        expect(jpeg[componentsOffset]).toBe(1);
        expect(jpeg[componentsOffset + 1]).toBe(0x22);
        expect(jpeg[componentsOffset + 2]).toBe(0);

        // Cb component: ID=2, sampling=0x11 (1x1), quantTable=1
        expect(jpeg[componentsOffset + 3]).toBe(2);
        expect(jpeg[componentsOffset + 4]).toBe(0x11);
        expect(jpeg[componentsOffset + 5]).toBe(1);

        // Cr component: ID=3, sampling=0x11 (1x1), quantTable=1
        expect(jpeg[componentsOffset + 6]).toBe(3);
        expect(jpeg[componentsOffset + 7]).toBe(0x11);
        expect(jpeg[componentsOffset + 8]).toBe(1);
    });

    /**
     * Test: 4:2:0 roundtrip encodes and decodes correctly
     */
    it('4:2:0 roundtrip - encodes and decodes correctly', async () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);

        // Create a simple pattern
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                data[idx] = 200;     // R
                data[idx + 1] = 100; // G
                data[idx + 2] = 50;  // B
                data[idx + 3] = 255; // A
            }
        }

        // Encode with 4:2:0
        const encoder = new JpegEncoder(90, { subsampling: '4:2:0' });
        const jpeg = await encoder.encode({ width, height, data });

        // Decode
        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpeg, { skipExtraction: true });
        expect(err).toBeNull();

        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);
        expect(decoded.metadata.chromaSubsampling).toBe('4:2:0');

        // Check pixel values are reasonable (within compression tolerance)
        const avgR = decoded.data[0];
        const avgG = decoded.data[1];
        const avgB = decoded.data[2];

        expect(Math.abs(avgR - 200)).toBeLessThan(30);
        expect(Math.abs(avgG - 100)).toBeLessThan(30);
        expect(Math.abs(avgB - 50)).toBeLessThan(30);
    });

    /**
     * Test: 4:2:0 lossless transcoding preserves subsampling
     */
    it('4:2:0 lossless transcoding preserves subsampling', async () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4).fill(128);

        // Create initial 4:2:0 JPEG
        const encoder1 = new JpegEncoder(80, { subsampling: '4:2:0' });
        const jpeg1 = await encoder1.encode({ width, height, data });

        // Decode
        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpeg1, { skipExtraction: true });
        expect(err).toBeNull();

        expect(decoded.metadata.chromaSubsampling).toBe('4:2:0');

        // Transcode using coefficients
        const encoder2 = new JpegEncoder(80);
        const jpeg2 = await encoder2.encodeCoefficients(
            decoded.coefficients,
            decoded.quantizationTables,
            { width, height }
        );

        // Decode transcoded image
        const decoder2 = new JpegDecoder();
        const [decoded2, err2] = await decoder2.decode(jpeg2, { skipExtraction: true });
        expect(err2).toBeNull();

        // Should preserve 4:2:0 subsampling
        expect(decoded2.metadata.chromaSubsampling).toBe('4:2:0');
    });

    /**
     * Test: 4:2:0 with odd dimensions works correctly
     */
    it('4:2:0 with odd dimensions works correctly', async () => {
        const width = 63;
        const height = 47;
        const data = new Uint8ClampedArray(width * height * 4).fill(200);

        const encoder = new JpegEncoder(80, { subsampling: '4:2:0' });
        const jpeg = await encoder.encode({ width, height, data });

        const decoder = new JpegDecoder();
        const [decoded, err] = await decoder.decode(jpeg, { skipExtraction: true });
        expect(err).toBeNull();

        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);
    });
});
