import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from './pbt.js';
import { encodeBase32, decodeBase32 } from '../../src/utils/base32.js';

function bytes(str) { return new TextEncoder().encode(str); }
function str(bytes) { return new TextDecoder().decode(bytes); }

describe('Base32 codec (RFC 4648)', () => {

    const vectors = [
        ['', ''],
        ['f', 'MY======'],
        ['fo', 'MZXQ===='],
        ['foo', 'MZXW6==='],
        ['foob', 'MZXW6YQ='],
        ['fooba', 'MZXW6YTB'],
        ['foobar', 'MZXW6YTBOI======']
    ];

    for (const [input, expected] of vectors) {
        it(`encodes "${input}" to "${expected}"`, () => {
            const result = encodeBase32(bytes(input));
            expect(result).toBe(expected);
        });

        if (input) {
            it(`decodes "${expected}" back to "${input}"`, () => {
                const [decoded, err] = decodeBase32(expected);
                expect(err).toBe(null);
                expect(str(decoded)).toBe(input);
            });
        }
    }

    it('roundtrips arbitrary bytes (property)', () => {
        for (let len = 0; len <= 40; len++) {
            const data = new Uint8Array(len);
            for (let i = 0; i < len; i++) data[i] = (i * 37 + 11) & 0xFF;
            const encoded = encodeBase32(data);
            const [decoded, err] = decodeBase32(encoded);
            expect(err).toBe(null);
            expect(decoded).toEqual(data);
        }
    });

    it('Property: roundtrips arbitrary byte arrays up to 512 bytes with charset invariant', async () => {
        await assertProperty(
            [Arbitrary.byteArray(0, 512)],
            (bytes) => {
                const encoded = encodeBase32(bytes);
                expect(typeof encoded).toBe('string');
                // RFC 4648 Base32 alphabet: A-Z, 2-7, and '=' padding
                expect(/^[A-Z2-7]*={0,6}$/.test(encoded)).toBe(true);

                const [decoded, err] = decodeBase32(encoded);
                expect(err).toBe(null);
                expect(decoded instanceof Uint8Array).toBe(true);
                expect(decoded.length).toBe(bytes.length);
                expect(decoded).toEqual(bytes);
            },
            200
        );
    });

    it('Property (MR): lowercase decoding matches uppercase decoding exactly', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 128)],
            (bytes) => {
                const upper = encodeBase32(bytes);
                const lower = upper.toLowerCase();

                const [decUpper, eUpper] = decodeBase32(upper);
                const [decLower, eLower] = decodeBase32(lower);

                expect(eUpper).toBe(null);
                expect(eLower).toBe(null);
                expect(decUpper).toEqual(decLower);
            },
            100
        );
    });

    it('decodes case-insensitively and strips padding', () => {
        const [lower, errLower] = decodeBase32('mzxw6===');
        expect(errLower).toBe(null);
        expect(str(lower)).toBe('foo');

        const [noPad, errNoPad] = decodeBase32('MZXW6');
        expect(errNoPad).toBe(null);
        expect(str(noPad)).toBe('foo');
    });

    it('rejects invalid characters via tuple', () => {
        const [, err] = decodeBase32('ABC1'); // '1' is not in the Base32 alphabet
        expect(err).toBeInstanceOf(Error);
    });

    it('Property: invalid characters are always rejected cleanly via typed error', async () => {
        // Injection of invalid base32 characters (0, 1, 8, 9, punctuation)
        const invalidChars = ['0', '1', '8', '9', '!', '@', '#', '$', '%', '^', '&', '*', '?'];
        await assertProperty(
            [Arbitrary.byteArray(1, 64), Arbitrary.integer(0, invalidChars.length - 1)],
            (bytes, charIdx) => {
                const validEncoded = encodeBase32(bytes);
                const corrupted = invalidChars[charIdx] + validEncoded.slice(1);
                const [decoded, err] = decodeBase32(corrupted);
                expect(decoded).toBe(null);
                expect(err instanceof Error).toBe(true);
            },
            100
        );
    });
});
