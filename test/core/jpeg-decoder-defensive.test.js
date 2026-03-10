// Defensive Validation Tests
import { describe as suite, it as test, expect } from '../utils/test-runner.js';
import { JpegDecoder } from '../../src/codec/decoder.js';

suite('JPEG Decoder Defensive Tests', () => {

    test('should fail fast with distinct error if file does not start with FF D8 (SOI)', async () => {
        const decoder = new JpegDecoder();

        // PNG magic number instead of JPEG
        const badBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        const [result, err] = await decoder.decode(badBytes);

        expect(result).toBeNull();
        expect(err !== null).toBe(true);
        expect(err.message.includes('Invalid JPEG signature')).toBe(true);
        expect(err.message.includes('FF D8')).toBe(true);
    });

    test('should fail safely on empty or null buffers', async () => {
        const decoder = new JpegDecoder();

        const [res1, err1] = await decoder.decode(new Uint8Array(0));
        expect(res1).toBeNull();
        expect(err1.message.includes('Invalid JPEG signature')).toBe(true);

        const [res2, err2] = await decoder.decode(null);
        expect(res2).toBeNull();
        expect(err2.message.includes('Invalid JPEG signature')).toBe(true);
    });
});
