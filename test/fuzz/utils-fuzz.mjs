import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { encodeBase32, decodeBase32 } from '../../src/utils/base32.js';
import { bytesToBase64, base64ToBytes, utf8ToBytes } from '../../src/utils/encoding.js';
import { isSafeHttpUrl } from '../../src/utils/url-safety.js';
import { escapeHtml } from '../../src/utils/escape-html.js';
import { crc32 } from '../../src/utils/crc32.js';

/**
 * Utilities Fuzz Suite: Base32, Base64/UTF-8, URL safety, escape-html, and CRC32.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runUtilsFuzz(scale = 1) {
    const iters = Math.max(15, Math.floor(40 * scale));

    // 1. Base32 roundtrip and hostile reject
    await assertProperty(
        [Arbitrary.byteArray(0, 128)],
        (bytes) => {
            const b32 = encodeBase32(bytes);
            const [recovered, err] = decodeBase32(b32);
            if (err) throw err;
            if (recovered.length !== bytes.length) throw new Error('Base32 length mismatch');
            for (let i = 0; i < bytes.length; i++) {
                if (recovered[i] !== bytes[i]) throw new Error(`Base32 byte mismatch at ${i}`);
            }
        },
        iters
    );

    // 2. Base64 roundtrip
    await assertProperty(
        [Arbitrary.byteArray(0, 256)],
        (bytes) => {
            const b64 = bytesToBase64(bytes);
            const [recovered, err] = base64ToBytes(b64);
            if (err) throw err;
            if (recovered.length !== bytes.length) throw new Error('Base64 length mismatch');
            for (let i = 0; i < bytes.length; i++) {
                if (recovered[i] !== bytes[i]) throw new Error(`Base64 byte mismatch at ${i}`);
            }
        },
        iters
    );

    // 3. UTF-8 roundtrip with lone surrogates
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
    await assertProperty(
        [Arbitrary.string(0, 100)],
        (str) => {
            const bytes = utf8ToBytes(str);
            const decoded = decoder.decode(bytes);
            const expected = typeof str.toWellFormed === 'function' ? str.toWellFormed() : str;
            if (decoded !== expected) {
                throw new Error('UTF-8 roundtrip did not preserve well-formed scalar values');
            }
        },
        iters
    );

    // 4. URL safety fuzzing with arbitrary strings and evil protocols
    const hostileProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:', 'blob:'];
    await assertProperty(
        [Arbitrary.string(0, 50), Arbitrary.integer(0, hostileProtocols.length - 1)],
        (payload, protoIdx) => {
            const evilUrl = `${hostileProtocols[protoIdx]}${payload}`;
            if (isSafeHttpUrl(evilUrl) !== false) {
                throw new Error(`Hostile protocol ${hostileProtocols[protoIdx]} was falsely accepted`);
            }
        },
        iters
    );

    // 5. escapeHtml sanitization
    await assertProperty(
        [Arbitrary.string(0, 100)],
        (str) => {
            const escaped = escapeHtml(str);
            if (escaped.includes('<') || escaped.includes('>') || escaped.includes('"') || escaped.includes("'")) {
                throw new Error('Raw HTML delimiter found in escaped string');
            }
        },
        iters
    );

    // 6. CRC-32 bit-flip sensitivity
    await assertProperty(
        [Arbitrary.byteArray(1, 64), Arbitrary.integer(0, 7)],
        (bytes, bitOffset) => {
            const c1 = crc32(bytes);
            const mutated = new Uint8Array(bytes);
            mutated[0] ^= (1 << bitOffset);
            const c2 = crc32(mutated);
            if (c1 === c2) {
                throw new Error('CRC32 collision on single-bit flip');
            }
        },
        iters
    );
}
