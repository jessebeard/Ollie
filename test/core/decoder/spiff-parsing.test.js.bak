import { JpegEncoder } from '../../../src/core/jpeg-encoder.js';
import { JpegDecoder } from '../../../src/core/jpeg-decoder.js';
import { describe, it, expect } from '../../../test/utils/test-runner.js';

describe('SPIFF Parsing', () => {
    it('should parse a valid SPIFF APP8 marker', () => {
        // Use Encoder to generate valid SPIFF JPEG
        const encoder = new JpegEncoder(50, { writeSpiff: true });
        const width = 16;
        const height = 16;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4).fill(128)
        };

        const jpegBytes = encoder.encode(imageData);

        const decoder = new JpegDecoder();
        decoder.decode(jpegBytes);

        expect(decoder.spiff).toBeDefined();
        expect(decoder.spiff.version.major).toBe(1);
        expect(decoder.spiff.version.minor).toBe(2);
        expect(decoder.spiff.profileId).toBe(1);
        expect(decoder.spiff.componentCount).toBe(3);
        expect(decoder.spiff.height).toBe(height);
        expect(decoder.spiff.width).toBe(width);
        expect(decoder.spiff.colorSpace).toBe(4); // YCbCr
        expect(decoder.spiff.bitsPerSample).toBe(8);
        expect(decoder.spiff.compressionType).toBe(5); // JPEG
        expect(decoder.spiff.resolutionUnits).toBe(1); // dpi
        expect(decoder.spiff.verticalResolution).toBe(72);
        expect(decoder.spiff.horizontalResolution).toBe(72);
    });

    it('should ignore SPIFF marker if not present', () => {
        const encoder = new JpegEncoder(50, { writeSpiff: false });
        const width = 8;
        const height = 8;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4).fill(0)
        };

        const jpegBytes = encoder.encode(imageData);

        const decoder = new JpegDecoder();
        decoder.decode(jpegBytes);

        expect(decoder.spiff).toBe(null);
    });
});
