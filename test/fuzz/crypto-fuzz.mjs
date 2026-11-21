import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { sha256 } from '../../src/information-theory/cryptography/crypto-provider.js';
import { KeyDerivation } from '../../src/information-theory/cryptography/pbkdf2.js';
import { Encryption } from '../../src/information-theory/cryptography/aes-gcm.js';
import { importHmacKey, signBytes, verifyBytes } from '../../src/information-theory/cryptography/hmac.js';

function hex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function aesKey() {
    const raw = new Uint8Array(32);
    globalThis.crypto.getRandomValues(raw);
    const [cryptoObj] = (function () { return [globalThis.crypto]; })();
    const key = await cryptoObj.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return key;
}

/**
 * Cryptography fuzz slice: SHA-256 known-answer anchors, AES-GCM structural
 * guarantees (lengths, AAD binding, IV uniqueness), PBKDF2 parameter bounds,
 * and HMAC roundtrips under adversarial inputs.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runCryptoFuzz(scale = 1) {
    // -- SHA-256 known-answer tests (FIPS 180 vectors) --
    const kat = async (msg, expected) => {
        const digest = await sha256(msg);
        if (hex(digest) !== expected) throw new Error(`sha256("${msg}") KAT mismatch`);
    };
    await kat('', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    await kat('abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    await kat(
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );

    // -- AES-GCM structure --
    const key = await aesKey();

    const emptyIv = new Uint8Array(12); emptyIv.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const [encEmpty, encEmptyErr] = await Encryption.encrypt(new Uint8Array(0), key);
    if (encEmptyErr) throw encEmptyErr;
    if (new Uint8Array(encEmpty.ciphertext).length !== 16) throw new Error('empty plaintext must yield exactly the GCM tag');
    {
        const [pt, decErr] = await Encryption.decrypt(encEmpty.ciphertext, key, encEmpty.iv);
        if (decErr || pt.length !== 0) throw new Error('empty plaintext roundtrip failed');
        void emptyIv;
    }

    await assertProperty(
        [Arbitrary.byteArray(1, 300)],
        async (payload) => {
            const [enc, err] = await Encryption.encrypt(payload, key);
            if (err) throw err;
            if (new Uint8Array(enc.ciphertext).length !== payload.length + 16) {
                throw new Error('ciphertext must be payload + 16-byte tag');
            }
            const [pt, decErr] = await Encryption.decrypt(enc.ciphertext, key, enc.iv);
            if (decErr || pt.join() !== payload.join()) throw new Error('roundtrip mismatch');
        },
        20 * scale
    );

    // AAD binding: ciphertext authenticated under AAD "a" must fail under "b".
    {
        const payload = new TextEncoder().encode('aad binding check');
        const [enc, err] = await Encryption.encrypt(payload, key, { additionalData: new TextEncoder().encode('entry-id-a') });
        if (err) throw err;
        const [, wrongAad] = await Encryption.decrypt(enc.ciphertext, key, enc.iv, { additionalData: new TextEncoder().encode('entry-id-b') });
        if (!(wrongAad instanceof Error)) throw new Error('cross-AAD decryption accepted');
        const [okPt, okErr] = await Encryption.decrypt(enc.ciphertext, key, enc.iv, { additionalData: new TextEncoder().encode('entry-id-a') });
        if (okErr || okPt.join() !== payload.join()) throw new Error('matching-AAD roundtrip failed');
    }

    // IV uniqueness sampling.
    {
        const seen = new Set();
        for (let i = 0; i < 100; i++) {
            const [enc] = await Encryption.encrypt(new Uint8Array(1), key);
            const s = hex(/** @type {Uint8Array} */ (enc.iv));
            if (seen.has(s)) throw new Error('IV collision within sample');
            seen.add(s);
        }
    }

    // -- PBKDF2 bounds --
    for (const bad of /** @type {any} */ ([-1, 0, 1.5, 'x'])) {
        const [, err] = await KeyDerivation.deriveRawBits('pw', new Uint8Array(16), { iterations: bad });
        if (!(err instanceof Error)) throw new Error(`accepted iterations=${bad}`);
    }
    {
        // Sub-minimum bit lengths fall back to the documented 256 default.
        const [raw] = await KeyDerivation.deriveRawBits('pw', new Uint8Array(16), { iterations: 100, bits: 200 });
        if (raw.length !== 32) throw new Error('bits fallback to 256 broken');
    }

    // -- HMAC adversarial inputs (long-run registry body; light here too) --
    const [hk] = await importHmacKey(new TextEncoder().encode('crypto-fuzz-key'));
    await assertProperty(
        [Arbitrary.byteArray(1, 200)],
        async (data) => {
            const [mac, signErr] = await signBytes(hk, data);
            if (signErr) throw signErr;
            const [ok] = await verifyBytes(hk, data, mac);
            if (ok !== true) throw new Error('roundtrip verify failed');
            const flipped = Uint8Array.from(data);
            flipped[0] ^= 0x01;
            const [badOk] = await verifyBytes(hk, flipped, mac);
            if (badOk !== false && data[0] !== flipped[0]) throw new Error('tamper accepted');
        },
        15 * scale
    );
}
