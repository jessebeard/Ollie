import { describe, it, expect } from '../utils/test-runner.js';
import { JpegDecoder } from '../../src/codec/decoder.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js'; async function loadFixture(filename) {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = await import('fs');
        const path = await import('path');
        const url = await import('url');
        const __filename = url.fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        return fs.readFileSync(path.join(__dirname, '../fixtures', filename));
    } else {
        const response = await fetch('/test/fixtures/' + filename);
        if (!response.ok) throw new Error(`Failed to load fixture: ${filename}`);
        return new Uint8Array(await response.arrayBuffer());
    }
}

describe('JpegDecoder Integration', async () => {
    it('should decode solid black 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        const decoder = new JpegDecoder();

        const [result, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);
        expect(result.data.length).toBe(8 * 8 * 4);

        const firstPixelR = result.data[0];
        const firstPixelG = result.data[1];
        const firstPixelB = result.data[2];
        expect(firstPixelR < 20).toBe(true);
        expect(firstPixelG < 20).toBe(true);
        expect(firstPixelB < 20).toBe(true);
    });

    it('should decode solid white 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('solid-white-8x8.jpg');
        const decoder = new JpegDecoder();

        const [result, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);

        const firstPixelR = result.data[0];
        const firstPixelG = result.data[1];
        const firstPixelB = result.data[2];
        expect(firstPixelR > 235).toBe(true);
        expect(firstPixelG > 235).toBe(true);
        expect(firstPixelB > 235).toBe(true);
    });

    it('should decode solid red 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('solid-red-8x8.jpg');
        const decoder = new JpegDecoder();

        const [result, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);

        const firstPixelR = result.data[0];
        const firstPixelG = result.data[1];
        const firstPixelB = result.data[2];
        expect(firstPixelR > 235).toBe(true);
        expect(firstPixelG < 20).toBe(true);
        expect(firstPixelB < 20).toBe(true);
    });

    it('should decode checkerboard 8x8 JPEG', async () => {
        const jpegBytes = await loadFixture('checkerboard-8x8.jpg');
        const decoder = new JpegDecoder();

        const [result, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(result.width).toBe(8);
        expect(result.height).toBe(8);
        expect(result.data.length).toBe(8 * 8 * 4);

        const pixel0 = result.data[0];
        const pixel1 = result.data[4];
        expect(Math.abs(pixel0 - pixel1) > 50).toBe(true);
    });

    it('should decode gradient 16x16 JPEG', async () => {
        const jpegBytes = await loadFixture('gradient-16x16.jpg');
        const decoder = new JpegDecoder();

        const [result, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(result.width).toBe(16);
        expect(result.height).toBe(16);
        expect(result.data.length).toBe(16 * 16 * 4);
    });

    it('should decode color blocks 24x24 JPEG', async () => {
        const jpegBytes = await loadFixture('color-blocks-24x24.jpg');
        const decoder = new JpegDecoder();

        const [result, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        expect(result.width).toBe(24);
        expect(result.height).toBe(24);
        expect(result.data.length).toBe(24 * 24 * 4);
    });

    it('should set alpha channel to 255', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        const decoder = new JpegDecoder();

        const [result, err] = await decoder.decode(jpegBytes);
        expect(err).toBeNull();

        for (let i = 3; i < result.data.length; i += 4) {
            expect(result.data[i]).toBe(255);
        }
    });

    it('should handle different quality settings', async () => {
        const q10 = await loadFixture('checkerboard-8x8-q10.jpg');
        const q90 = await loadFixture('checkerboard-8x8-q90.jpg');

        const decoder = new JpegDecoder();

        const [result10, err10] = await decoder.decode(q10);
        expect(err10).toBeNull();
        const [result90, err90] = await decoder.decode(q90);
        expect(err90).toBeNull();

        expect(result10.width).toBe(8);
        expect(result90.width).toBe(8);
        expect(result10.height).toBe(8);
        expect(result90.height).toBe(8);
    });

    it('should validate SOI marker', async () => {
        const invalidBytes = new Uint8Array([0xFF, 0xD0]);
        const decoder = new JpegDecoder();

        const [_, err] = await decoder.decode(invalidBytes);
        expect(err).toBeTruthy();
        expect(err.message.includes('SOI')).toBe(true);
    });

    it('should require SOF0 marker', async () => {

        const bytes = new Uint8Array([
            0xFF, 0xD8,
            0xFF, 0xD9
        ]);
        const decoder = new JpegDecoder();

        const [_, err] = await decoder.decode(bytes);
        expect(err).toBeTruthy();
        expect(err.message.includes('SOF0') || err.message.includes('baseline')).toBe(true);
    });

    it('should reset state between decodes', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        const decoder = new JpegDecoder();

        const [result1, err1] = await decoder.decode(jpegBytes);
        expect(err1).toBeNull();
        const [result2, err2] = await decoder.decode(jpegBytes);
        expect(err2).toBeNull();

        expect(result1.width).toBe(result2.width);
        expect(result1.height).toBe(result2.height);
        expect(result1.data.length).toBe(result2.data.length);
    });
    it('should handle invalid input to setDequantizationMethod', () => {
        const decoder = new JpegDecoder();
        const [res1, err1] = decoder.setDequantizationMethod('not-a-function');
        expect(res1).toBeNull();
        expect(err1).toBeTruthy();
        expect(err1.message.includes('expects a function')).toBe(true);

        const [res2, err2] = decoder.setDequantizationMethod(() => { });
        expect(res2).toBe(true);
        expect(err2).toBeNull();
    });

    it('should handle invalid input to setIdctMethod', () => {
        const decoder = new JpegDecoder();
        const [res1, err1] = decoder.setIdctMethod('unknown-method');
        expect(res1).toBeNull();
        expect(err1).toBeTruthy();
        expect(err1.message.includes('Unknown IDCT method')).toBe(true);

        const [res2, err2] = decoder.setIdctMethod(12345);
        expect(res2).toBeNull();
        expect(err2).toBeTruthy();
        expect(err2.message.includes('expects a function or a known')).toBe(true);

        const [res3, err3] = decoder.setIdctMethod('fastAAN');
        expect(res3).toBe(true);
        expect(err3).toBeNull();
    });

    it('should return error for truncated SOF', async () => {
        // Missing SOF data after marker
        const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x03, 0x08]);
        const decoder = new JpegDecoder();
        const [res, err] = await decoder.decode(bytes);
        expect(res).toBeNull();
        expect(err).toBeTruthy();
        // Since parseFrameHeader fails, it'll bubble up the error tuple
    });

    it('should return error for missing SOS marker', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        // Find SOS (0xFFDA) and truncate before it
        let sosPos = -1;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xDA) {
                sosPos = i; break;
            }
        }
        expect(sosPos > -1).toBe(true);
        const truncated = jpegBytes.slice(0, sosPos);

        const decoder = new JpegDecoder();
        const [res, err] = await decoder.decode(truncated);
        expect(res).toBeNull();
        expect(err).toBeTruthy();
        expect(err.message.includes('Missing SOS marker')).toBe(true);
    });

    it('should return error for invalid block count (too large)', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        // Mutate SOF width/height to be absurdly large (e.g., 65535x65535)
        let sofPos = -1;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xC0) {
                sofPos = i; break;
            }
        }
        const mutated = new Uint8Array(jpegBytes);
        // SOF0 marker is FF C0. Length is 2 bytes. Precision 1 byte. Height 2 bytes. Width 2 bytes
        mutated[sofPos + 5] = 0xFF; // Height
        mutated[sofPos + 6] = 0xFF; // Height
        mutated[sofPos + 7] = 0xFF; // Width
        mutated[sofPos + 8] = 0xFF; // Width

        const decoder = new JpegDecoder();
        const [res, err] = await decoder.decode(mutated);
        expect(res).toBeNull();
        expect(err).toBeTruthy();
        expect(err.message.includes('Invalid block count')).toBe(true);
    });

    it('should return error for missing Quantization table', async () => {
        const jpegBytes = await loadFixture('solid-black-8x8.jpg');
        // Remove DQT segment (0xFFDB) by skipping the marker + length + payload
        const mutated = [];
        for (let i = 0; i < jpegBytes.length; i++) {
            if (i + 1 < jpegBytes.length && jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xDB) {
                const len = (jpegBytes[i + 2] << 8) | jpegBytes[i + 3];
                i += len + 1; // Skip marker (2 bytes) + length + payload
                continue;
            }
            mutated.push(jpegBytes[i]);
        }

        const decoder = new JpegDecoder();
        const [res, err] = await decoder.decode(new Uint8Array(mutated));
        expect(res).toBeNull();
        expect(err).toBeTruthy();
        expect(err.message.includes('quantization table') || err.message.includes('Quantization')).toBe(true);
    });

    describe('Property-Based Fuzzing', () => {
        it('should never throw an unhandled exception on random garbage (PBT)', async () => {
            await assertProperty(
                [Arbitrary.byteArray(0, 500)],
                async (garbageBytes) => {
                    const decoder = new JpegDecoder();
                    // Just ensuring it doesn't throw. We expect [null, error] 99.9% of the time,
                    // or [result, null] if by miracle it's a valid JPEG.
                    try {
                        const [res, err] = await decoder.decode(garbageBytes, { skipExtraction: true });
                        return true;
                    } catch (e) {
                        return false; // Test fails if it throws
                    }
                },
                15 // 15 randomized iterations to avoid massive timeouts
            );
        });
    });
});
