import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { encodeBase32, decodeBase32 } from '../../src/utils/base32.js';
import { crc32 } from '../../src/utils/crc32.js';
import { deflate, inflate } from '../../src/utils/compression.js';
import { bytesToBase64, base64ToBytes } from '../../src/utils/encoding.js';
import { isSafeHttpUrl } from '../../src/utils/url-safety.js';

describe('Utils Dedicated PBT Suite', () => {
    it('Property: Base32 encode -> decode roundtrip preserves arbitrary byte buffers', async () => {
        await assertProperty(
            [Arbitrary.byteArray(0, 128)],
            (bytes) => {
                const b32 = encodeBase32(bytes);
                const [recovered, err] = decodeBase32(b32);
                expect(err).toBe(null);
                expect(Array.from(recovered)).toEqual(Array.from(bytes));
            },
            50
        );
    });

    it('Property: Deflate -> Inflate preserves arbitrary byte payloads and handles empty input', async () => {
        await assertProperty(
            [Arbitrary.byteArray(0, 300)],
            async (bytes) => {
                const [compressed, compErr] = await deflate(bytes);
                expect(compErr).toBe(null);

                const [recovered, decompErr] = await inflate(compressed);
                expect(decompErr).toBe(null);
                expect(Array.from(recovered)).toEqual(Array.from(bytes));
            },
            40
        );
    });

    it('Property: Base64 encode -> decode roundtrip preserves arbitrary byte payloads', async () => {
        await assertProperty(
            [Arbitrary.byteArray(0, 200)],
            (bytes) => {
                const b64 = bytesToBase64(bytes);
                const [recovered, err] = base64ToBytes(b64);
                expect(err).toBe(null);
                expect(Array.from(recovered)).toEqual(Array.from(bytes));
            },
            50
        );
    });

    it('Property: CRC32 detects every single-bit flip across arbitrary byte streams', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 64), Arbitrary.integer(0, 7)],
            (bytes, bitIdx) => {
                const c1 = crc32(bytes);
                const byteIdx = Math.floor(Math.random() * bytes.length);
                const mutated = new Uint8Array(bytes);
                mutated[byteIdx] ^= (1 << bitIdx);
                const c2 = crc32(mutated);

                expect(c1).not.toBe(c2);
            },
            50
        );
    });

    it('Property: isSafeHttpUrl strictly rejects dangerous protocols and non-strings', async () => {
        const evilSchemes = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
        await assertProperty(
            [Arbitrary.string(0, 30), Arbitrary.integer(0, evilSchemes.length - 1)],
            (body, idx) => {
                const url = `${evilSchemes[idx]}${body}`;
                expect(isSafeHttpUrl(url)).toBe(false);

                // Non-strings must return false
                expect(isSafeHttpUrl(null)).toBe(false);
                expect(isSafeHttpUrl(undefined)).toBe(false);
                expect(isSafeHttpUrl(12345)).toBe(false);
                expect(isSafeHttpUrl({})).toBe(false);

                // Legitimate http/https URLs must return true
                expect(isSafeHttpUrl('https://example.com')).toBe(true);
                expect(isSafeHttpUrl('http://sub.domain.org/path?query=1')).toBe(true);
            },
            40
        );
    });
});
