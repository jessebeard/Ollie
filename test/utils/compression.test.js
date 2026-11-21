import { describe, it, expect } from './test-runner.js';
import { Arbitrary, assertProperty } from './pbt.js';
import { deflate, inflate } from '../../src/utils/compression.js';

describe('Compression & Decompression (Deflate/Inflate Streams)', () => {
    it('returns typed error tuples for non-Uint8Array inputs', async () => {
        const [r1, err1] = await deflate(/** @type {any} */ ('not bytes'));
        expect(r1).toBe(null);
        expect(err1 instanceof Error).toBe(true);
        expect(err1.message).toContain('input must be a Uint8Array');

        const [r2, err2] = await inflate(/** @type {any} */ ([1, 2, 3]));
        expect(r2).toBe(null);
        expect(err2 instanceof Error).toBe(true);
        expect(err2.message).toContain('input must be a Uint8Array');
    });

    it('roundtrips empty buffer to empty buffer', async () => {
        const empty = new Uint8Array(0);
        const [compressed, defErr] = await deflate(empty);
        expect(defErr).toBe(null);
        expect(compressed instanceof Uint8Array).toBe(true);
        expect(compressed.length).toBe(0);

        const [decompressed, infErr] = await inflate(compressed);
        expect(infErr).toBe(null);
        expect(decompressed instanceof Uint8Array).toBe(true);
        expect(decompressed.length).toBe(0);
    });

    it('roundtrips known repetitive and compressible payload', async () => {
        const pattern = new Uint8Array(1024);
        for (let i = 0; i < pattern.length; i++) {
            pattern[i] = i % 16;
        }

        const [compressed, defErr] = await deflate(pattern);
        expect(defErr).toBe(null);
        expect(compressed instanceof Uint8Array).toBe(true);
        // Repetitive data should compress significantly under deflate-raw
        expect(compressed.length).toBeLessThan(pattern.length);

        const [decompressed, infErr] = await inflate(compressed);
        expect(infErr).toBe(null);
        expect(decompressed instanceof Uint8Array).toBe(true);
        expect(decompressed.length).toBe(pattern.length);
        expect(decompressed).toEqual(pattern);
    });

    it('Property: roundtrip preserves arbitrary byte payloads', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 1024)],
            async (bytes) => {
                const [compressed, defErr] = await deflate(bytes);
                expect(defErr).toBe(null);
                expect(compressed instanceof Uint8Array).toBe(true);

                const [decompressed, infErr] = await inflate(compressed);
                expect(infErr).toBe(null);
                expect(decompressed instanceof Uint8Array).toBe(true);
                expect(decompressed.length).toBe(bytes.length);
                expect(decompressed).toEqual(bytes);
            },
            50
        );
    });

    it('returns a typed error tuple when decompressing malformed byte stream', async () => {
        // Garbage byte stream that is not valid deflate data
        const garbage = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03]);
        const [decompressed, infErr] = await inflate(garbage);
        expect(decompressed).toBe(null);
        expect(infErr instanceof Error).toBe(true);
    });

    it('Property (M-01): CRC-32 checksum survives deflate/inflate roundtrip', async () => {
        const { crc32 } = await import('../../src/utils/crc32.js');
        await assertProperty(
            [Arbitrary.byteArray(10, 2048)],
            async (payload) => {
                const origCrc = crc32(payload);
                const [compressed, defErr] = await deflate(payload);
                expect(defErr).toBe(null);

                const [decompressed, infErr] = await inflate(compressed);
                expect(infErr).toBe(null);

                const recoveredCrc = crc32(decompressed);
                expect(recoveredCrc).toBe(origCrc);
            },
            40
        );
    });

    it('fails closed with typed error on truncated compressed stream', async () => {
        const payload = new Uint8Array(500).fill(42);
        const [compressed, defErr] = await deflate(payload);
        expect(defErr).toBe(null);

        // Truncate the compressed stream in half
        const truncated = compressed.slice(0, Math.floor(compressed.length / 2));
        const [decompressed, infErr] = await inflate(truncated);
        expect(decompressed).toBe(null);
        expect(infErr instanceof Error).toBe(true);
    });
});
