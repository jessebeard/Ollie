import { describe, it, expect } from './test-runner.js';
import { Arbitrary, assertProperty } from './pbt.js';
import { crc32 } from '../../src/utils/crc32.js';

describe('CRC32 Checksum Utility', () => {
    it('matches IEEE 802.3 standard check value for "123456789"', () => {
        const ascii = new TextEncoder().encode('123456789');
        const sum = crc32(ascii);
        expect(sum).toBe(0xCBF43926);
    });

    it('produces consistent zero checksum for empty input', () => {
        const empty = new Uint8Array(0);
        expect(crc32(empty)).toBe(0);
        expect(crc32(new Uint8Array(0))).toBe(0);
    });

    it('Property: deterministic evaluation across repeated calls', async () => {
        await assertProperty(
            [Arbitrary.byteArray(0, 512)],
            (bytes) => {
                const a = crc32(bytes);
                const b = crc32(bytes);
                expect(a).toBe(b);
                expect(typeof a).toBe('number');
                expect(a >= 0 && a <= 0xFFFFFFFF).toBe(true);
            },
            100
        );
    });

    it('Property: single-bit flip always alters checksum', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 256), Arbitrary.integer(0, 7)],
            (bytes, bitOffset) => {
                const originalCrc = crc32(bytes);

                // Clone and mutate single bit in first byte (or random byte)
                const mutated = new Uint8Array(bytes);
                mutated[0] ^= (1 << bitOffset);

                const mutatedCrc = crc32(mutated);
                expect(mutatedCrc).not.toBe(originalCrc);
            },
            100
        );
    });

    it('Property: buffer slice identity matching whole-buffer subslice', async () => {
        await assertProperty(
            [Arbitrary.byteArray(10, 100)],
            (bytes) => {
                const prefix = bytes.slice(0, 5);
                const standalone = new Uint8Array(prefix);
                expect(crc32(prefix)).toBe(crc32(standalone));
            },
            50
        );
    });
});
