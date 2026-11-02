/**
 * Opaque Zero-Length Container Framing (Format v4).
 *
 * Implements true plausible-deniability steganographic framing:
 * - NO length headers, version flags, or magic bytes in the carrier.
 * - Carrier holds only: [Salt: 16 bytes] || [AES-256-GCM Ciphertext: Bucket Size B + 16 bytes tag].
 * - Real payload length, deflated content, and CSPRNG padding are sealed inside the ciphertext.
 * - Unencrypted bits in the carrier are mathematically indistinguishable from random noise.
 */
import { deriveStegoKeys, deriveEnvelopeKeysV41, deriveStegoKeysV41 } from '../cryptography/kdf-chain.js';
import { deflate, inflate } from '../../utils/compression.js';
import { getCrypto } from '../cryptography/crypto-provider.js';

export const STANDARD_BUCKETS = [
    256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576
];

export const SALT_BYTES = 16;
export const TAG_BYTES = 16;
export const LENGTH_HEADER_BYTES = 4;
export const COMPRESSED_FLAG = 0x80000000 >>> 0;

/**
 * Finds the smallest standard capacity bucket that fits the given payload.
 *
 * @param {number} dataLength
 * @returns {number} Bucket size in bytes
 */
export function selectBucketSize(dataLength) {
    const minNeeded = dataLength + LENGTH_HEADER_BYTES;
    for (const b of STANDARD_BUCKETS) {
        if (b >= minNeeded) return b;
    }
    // For large payloads, align up to 64KB boundary
    return Math.ceil(minNeeded / 65536) * 65536;
}

/**
 * Frames and pads payload into a fixed bucket boundary.
 * Structure: [uint32 BE compressedLen] || [compressedData] || [CSPRNG random padding]
 *
 * @param {Uint8Array} payload
 * @param {number} bucketSize
 * @returns {Promise<[Uint8Array|null, Error|null]>}
 */
export async function packFramedPayload(payload, bucketSize) {
    if (!(payload instanceof Uint8Array)) {
        return [null, new Error('opaque-container: payload must be a Uint8Array')];
    }
    if (!Number.isInteger(bucketSize) || bucketSize < LENGTH_HEADER_BYTES) {
        return [null, new Error('opaque-container: invalid bucket size')];
    }

    const [compressed, compErr] = await deflate(payload);
    let storeData;
    let isCompressed = false;
    let storedLen = payload.length;

    // Only compress if it genuinely saves space; otherwise store uncompressed to avoid 5-byte Deflate expansion
    if (!compErr && compressed && compressed.length < payload.length) {
        storeData = compressed;
        isCompressed = true;
        storedLen = compressed.length;
    } else {
        storeData = payload;
        isCompressed = false;
        storedLen = payload.length;
    }

    if (storedLen + LENGTH_HEADER_BYTES > bucketSize) {
        return [null, new Error(
            `opaque-container: payload (${storedLen + LENGTH_HEADER_BYTES}B) exceeds bucket size (${bucketSize}B)`
        )];
    }

    const frame = new Uint8Array(bucketSize);
    const headerVal = ((isCompressed ? COMPRESSED_FLAG : 0) | storedLen) >>> 0;
    new DataView(frame.buffer, frame.byteOffset, frame.byteLength).setUint32(0, headerVal, false);
    frame.set(storeData, LENGTH_HEADER_BYTES);

    // Fill remaining padding with CSPRNG bytes so padding is indistinguishable from random data
    const padStart = LENGTH_HEADER_BYTES + storedLen;
    const padLen = bucketSize - padStart;
    if (padLen > 0) {
        const [cryptoObj, cryptoErr] = getCrypto();
        if (cryptoErr || !cryptoObj) {
            return [null, cryptoErr || new Error('opaque-container: crypto provider unavailable')];
        }
        const MAX_CHUNK = 65536;
        for (let offset = 0; offset < padLen; offset += MAX_CHUNK) {
            const chunkSize = Math.min(MAX_CHUNK, padLen - offset);
            cryptoObj.getRandomValues(frame.subarray(padStart + offset, padStart + offset + chunkSize));
        }
    }

    return [frame, null];
}

/**
 * Unpacks framed plaintext, verifies length, and inflates original payload.
 *
 * @param {Uint8Array} plaintext
 * @returns {Promise<[Uint8Array|null, Error|null]>}
 */
export async function unpackFramedPayload(plaintext) {
    if (!(plaintext instanceof Uint8Array) || plaintext.length < LENGTH_HEADER_BYTES) {
        return [null, new Error('opaque-container: plaintext too short to unpack')];
    }

    const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength);
    const headerVal = view.getUint32(0, false);
    const isCompressed = (headerVal & COMPRESSED_FLAG) !== 0;
    const payloadLen = headerVal & 0x7FFFFFFF;

    if (payloadLen > plaintext.length - LENGTH_HEADER_BYTES) {
        return [null, new Error('opaque-container: corrupted length framing')];
    }

    const payloadSlice = plaintext.subarray(LENGTH_HEADER_BYTES, LENGTH_HEADER_BYTES + payloadLen);
    if (isCompressed) {
        return inflate(payloadSlice);
    } else {
        return [payloadSlice, null];
    }
}

/**
 * Seals payload into an opaque wire envelope using Argon2id and AES-256-GCM.
 * Output: [Salt: 16B] || [Ciphertext + Tag: bucketSize + 16B]
 *
 * @param {Uint8Array} payload - Secret data
 * @param {string|Uint8Array} password - Master password
 * @param {Object} [options] - { bucketSize?, kdfOpts? }
 * @returns {Promise<[Uint8Array|null, Error|null]>} Wire bytes tuple
 */
export async function sealOpaque(payload, password, options = {}) {
    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr) return [null, cryptoErr];

    const salt = new Uint8Array(SALT_BYTES);
    cryptoObj.getRandomValues(salt);

    let keys;
    if (options.masterKey) {
        const [envKeys, envErr] = await deriveEnvelopeKeysV41(options.masterKey, salt);
        if (envErr) return [null, envErr];
        keys = envKeys;
    } else if (options.carrierSalt) {
        const [stegoKeys, kdfErr] = await deriveStegoKeysV41(password, options.carrierSalt, salt, options.kdfOpts);
        if (kdfErr) return [null, kdfErr];
        keys = stegoKeys;
    } else {
        const [stegoKeys, kdfErr] = await deriveStegoKeys(password, salt, options.kdfOpts);
        if (kdfErr) return [null, kdfErr];
        keys = stegoKeys;
    }

    const bucketSize = options.bucketSize || selectBucketSize(payload.length);
    const [framed, packErr] = await packFramedPayload(payload, bucketSize);
    if (packErr) return [null, packErr];

    try {
        const cryptoKey = await cryptoObj.subtle.importKey(
            'raw',
            /** @type {any} */ (keys.aesKey),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const ciphertextBuffer = await cryptoObj.subtle.encrypt(
            { name: 'AES-GCM', iv: /** @type {any} */ (keys.aesIV) },
            cryptoKey,
            /** @type {any} */ (framed)
        );

        const ciphertext = new Uint8Array(ciphertextBuffer);
        const wire = new Uint8Array(SALT_BYTES + ciphertext.length);
        wire.set(salt, 0);
        wire.set(ciphertext, SALT_BYTES);

        return [wire, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Decrypts and unpacks ciphertext using pre-derived cryptographic keys.
 *
 * @param {Uint8Array} ciphertext - Ciphertext with GCM tag
 * @param {{aesKey: Uint8Array, aesIV: Uint8Array}} keys
 * @returns {Promise<[Uint8Array|null, Error|null]>}
 */
export async function unsealWithKeys(ciphertext, keys) {
    const [cryptoObj, cryptoErr] = getCrypto();
    if (cryptoErr) return [null, cryptoErr];

    try {
        const cryptoKey = await cryptoObj.subtle.importKey(
            'raw',
            /** @type {any} */ (keys.aesKey),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        const decryptedBuffer = await cryptoObj.subtle.decrypt(
            { name: 'AES-GCM', iv: /** @type {any} */ (keys.aesIV) },
            cryptoKey,
            /** @type {any} */ (ciphertext)
        );

        const plaintext = new Uint8Array(decryptedBuffer);
        return unpackFramedPayload(plaintext);
    } catch (e) {
        return [null, new Error('opaque-container: authentication failed or wrong password')];
    }
}

/**
 * Unseals an opaque wire envelope back to original payload.
 *
 * @param {Uint8Array} wire - Wire bytes ([salt(16)][ciphertext])
 * @param {string|Uint8Array} password - Master password
 * @param {Object} [options] - { kdfOpts? }
 * @returns {Promise<[Uint8Array|null, Error|null]>} Decrypted payload tuple
 */
export async function unsealOpaque(wire, password, options = {}) {
    if (!(wire instanceof Uint8Array) || wire.length < SALT_BYTES + LENGTH_HEADER_BYTES + TAG_BYTES) {
        return [null, new Error('opaque-container: wire data too short')];
    }

    const salt = wire.subarray(0, SALT_BYTES);
    const ciphertext = wire.subarray(SALT_BYTES);

    let keys;
    if (options.masterKey) {
        const [envKeys, envErr] = await deriveEnvelopeKeysV41(options.masterKey, salt);
        if (envErr) return [null, envErr];
        keys = envKeys;
    } else if (options.carrierSalt) {
        const [stegoKeys, kdfErr] = await deriveStegoKeysV41(password, options.carrierSalt, salt, options.kdfOpts);
        if (kdfErr) return [null, kdfErr];
        keys = stegoKeys;
    } else {
        const [stegoKeys, kdfErr] = await deriveStegoKeys(password, salt, options.kdfOpts);
        if (kdfErr) return [null, kdfErr];
        keys = stegoKeys;
    }

    return unsealWithKeys(ciphertext, keys);
}
