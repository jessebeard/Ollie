import { describe, it, expect } from '../utils/test-runner.js';
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
            if (result !== expected) throw new Error(`got "${result}" expected "${expected}"`);
        });

        if (input) {
            it(`decodes "${expected}" back to "${input}"`, () => {
                const [decoded, err] = decodeBase32(expected);
                expect(err).toBe(null);
                if (str(decoded) !== input) throw new Error(`got "${str(decoded)}"`);
            });
        }
    }

    it('roundtrips arbitrary bytes (property)', () => {
        for (let len = 0; len <= 40; len++) {
            const data = new Uint8Array(len);
            for (let i = 0; i < len; i++) data[i] = (i * 37 + 11) & 0xFF;
            const encoded = encodeBase32(data);
            const [decoded, err] = decodeBase32(encoded);
            if (err) throw new Error(`decode error at len=${len}: ${err.message}`);
            if (decoded.join() !== data.join()) throw new Error(`roundtrip mismatch at len=${len}`);
        }
    });

    it('decodes case-insensitively and strips padding', () => {
        const [lower] = decodeBase32('mzxw6===');
        if (str(lower) !== 'foo') throw new Error(`lowercase failed: ${str(lower)}`);
        const [noPad] = decodeBase32('MZXW6');
        if (str(noPad) !== 'foo') throw new Error(`unpadded failed: ${str(noPad)}`);
    });

    it('rejects invalid characters via tuple', () => {
        const [, err] = decodeBase32('ABC1'); // '1' is not in the Base32 alphabet
        if (!(err instanceof Error)) throw new Error('invalid char accepted');
    });
});
