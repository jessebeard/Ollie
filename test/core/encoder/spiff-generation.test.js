import { JpegEncoder } from '../../../src/core/jpeg-encoder.js';
import { describe, it, expect } from '../../../test/utils/test-runner.js';

describe('SPIFF Generation', () => {
    it('should generate a valid SPIFF APP8 marker when enabled', () => {
        const encoder = new JpegEncoder(50, { writeSpiff: true });
        const width = 16;
        const height = 16;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4).fill(128)
        };

        const jpegBytes = encoder.encode(imageData);

        // Find APP8 marker (FF E8)
        let app8Index = -1;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xE8) {
                app8Index = i;
                break;
            }
        }

        expect(app8Index).toBeGreaterThan(-1);

        // Parse SPIFF header manually to verify contents
        const length = (jpegBytes[app8Index + 2] << 8) | jpegBytes[app8Index + 3];
        expect(length).toBe(32);

        const identifier = Array.from(jpegBytes.slice(app8Index + 4, app8Index + 10))
            .map(b => String.fromCharCode(b)).join('');
        expect(identifier).toBe('SPIFF\0');

        const versionMajor = jpegBytes[app8Index + 10];
        const versionMinor = jpegBytes[app8Index + 11];
        expect(versionMajor).toBe(1);
        expect(versionMinor).toBe(2);

        const profileId = jpegBytes[app8Index + 12];
        expect(profileId).toBe(1); // Continuous-tone base

        const componentCount = jpegBytes[app8Index + 13];
        expect(componentCount).toBe(3); // YCbCr

        const colorSpace = jpegBytes[app8Index + 22];
        // We expect 4 (YCbCr 3 - ITU-R BT.601-1) because we convert to YCbCr
        // The current implementation (before fix) likely writes 10 (RGB)
        expect(colorSpace).toBe(4);
    });

    it('should not generate SPIFF marker by default', () => {
        const encoder = new JpegEncoder(50);
        const width = 8;
        const height = 8;
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4).fill(0)
        };

        const jpegBytes = encoder.encode(imageData);

        let app8Index = -1;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xE8) {
                app8Index = i;
                break;
            }
        }

        expect(app8Index).toBe(-1);
    });
});
