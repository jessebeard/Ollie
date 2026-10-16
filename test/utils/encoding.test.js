import { describe, it, expect } from './test-runner.js';
import { Arbitrary, assertProperty } from './pbt.js';
import { bytesToBase64, base64ToBytes, utf8ToBytes } from '../../src/utils/encoding.js';

describe('Encoding Codecs (Base64 & UTF-8)', () => {
    it('roundtrips binary bytes to base64 and back', () => {
        const original = new Uint8Array([0, 1, 2, 253, 254, 255, 42, 65, 90]);
        const b64 = bytesToBase64(original);
        expect(typeof b64).toBe('string');

        const [recovered, err] = base64ToBytes(b64);
        expect(err).toBe(null);
        expect(recovered instanceof Uint8Array).toBe(true);
        expect(Array.from(recovered)).toEqual(Array.from(original));
    });

    it('returns a typed error tuple on invalid base64 string instead of throwing', () => {
        const invalidB64 = 'not-valid-base64-!!!@#$%^&*()';
        const [recovered, err] = base64ToBytes(invalidB64);
        expect(recovered).toBe(null);
        expect(err instanceof Error).toBe(true);
    });

    it('returns a typed error tuple on non-string input', () => {
        const [r1, err1] = base64ToBytes(null);
        expect(r1).toBe(null);
        expect(err1 instanceof Error).toBe(true);

        const [r2, err2] = base64ToBytes(12345);
        expect(r2).toBe(null);
        expect(err2 instanceof Error).toBe(true);

        const [r3, err3] = base64ToBytes({});
        expect(r3).toBe(null);
        expect(err3 instanceof Error).toBe(true);
    });

    it('encodes UTF-8 strings to bytes', () => {
        const text = 'Hello, Ollie!';
        const bytes = utf8ToBytes(text);
        expect(bytes instanceof Uint8Array).toBe(true);
        expect(new TextDecoder().decode(bytes)).toBe(text);
    });

    it('Property: base64 roundtrip identity across arbitrary byte buffers', async () => {
        await assertProperty(
            [Arbitrary.byteArray(0, 1024)],
            (bytes) => {
                const b64 = bytesToBase64(bytes);
                expect(typeof b64).toBe('string');
                // Character set check: valid base64 chars and padding only
                expect(/^[A-Za-z0-9+/]*={0,2}$/.test(b64)).toBe(true);

                const [recovered, err] = base64ToBytes(b64);
                expect(err).toBe(null);
                expect(recovered instanceof Uint8Array).toBe(true);
                expect(recovered.length).toBe(bytes.length);
                expect(recovered).toEqual(bytes);
            },
            100
        );
    });

    it('Property: utf8ToBytes roundtrip preserves unicode string content', async () => {
        const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
        await assertProperty(
            [Arbitrary.string(0, 200)],
            (str) => {
                const bytes = utf8ToBytes(str);
                expect(bytes instanceof Uint8Array).toBe(true);
                const decoded = decoder.decode(bytes);
                const expected = typeof str.toWellFormed === 'function' ? str.toWellFormed() : str;
                expect(decoded).toBe(expected);
            },
            100
        );
    });
});
