/**
 * Format v4.1 Stego-Payload Binary Slice Framing & Strong Parser.
 *
 * Implements Code Quality Rule 16 (Minimal Stego-Payloads & Strong Array Parsing):
 * - Eliminates Base64 wrapping of binary ciphertext stripes (0% encoding bloat).
 * - Binary Slice Frame: [version: 1B = 41, checksum: 4B BE, metaLen: 2B BE, metaBytes, rawBytes].
 * - Compact positional array serialization for carrier chunk metadata.
 * - Strict fail-closed parsing with explicit boundary checks, zero-copy byte slicing,
 *   active CRC-32 verification, and transparent backward compatibility with legacy v4.0 objects.
 */
import { crc32 } from '../../utils/crc32.js';
import { base64ToBytes } from '../../utils/encoding.js';
import { packManifest, unpackManifest } from './carrier-manifest.js';

export const STEGO_PAYLOAD_V41_VERSION = 41;
export const HEADER_SIZE_BYTES = 7;

/**
 * Positional indices for Chunk Metadata Tuple:
 * [0] id         - chunk ID string
 * [1] index      - chunk index (uint32)
 * [2] total      - total chunks (uint32)
 * [3] count      - stripe count (uint32, default 1)
 * [4] stripeSize - stripe byte size (uint32)
 * [5] startIndex - starting index (uint32)
 */
export const CHUNK_TUPLE_ID = 0;
export const CHUNK_TUPLE_INDEX = 1;
export const CHUNK_TUPLE_TOTAL = 2;
export const CHUNK_TUPLE_COUNT = 3;
export const CHUNK_TUPLE_STRIPE_SIZE = 4;
export const CHUNK_TUPLE_START_INDEX = 5;
export const CHUNK_TUPLE_LENGTH = 6;

/**
 * Packs chunk metadata into a compact positional array tuple.
 *
 * @param {Object|Array} chunk
 * @returns {[Array|null, Error|null]}
 */
export function packChunkMetadata(chunk) {
    if (!chunk) return [null, new Error('chunk-metadata: chunk required')];
    if (Array.isArray(chunk)) return [chunk, null];
    if (typeof chunk !== 'object') return [null, new Error('chunk-metadata: expected an object')];

    const tuple = [
        chunk.id !== undefined ? String(chunk.id) : '',
        Number.isInteger(chunk.index) ? chunk.index : 0,
        Number.isInteger(chunk.total) ? chunk.total : 1,
        Number.isInteger(chunk.count) ? chunk.count : 1,
        Number.isInteger(chunk.stripeSize) ? chunk.stripeSize : 0,
        Number.isInteger(chunk.startIndex) ? chunk.startIndex : (chunk.index || 0)
    ];
    return [tuple, null];
}

/**
 * Unpacks and validates a positional chunk metadata tuple into an internal record.
 *
 * @param {Array|Object} input
 * @returns {[Object|null, Error|null]}
 */
export function unpackChunkMetadata(input) {
    if (!input) return [null, new Error('chunk-metadata: input required')];
    if (typeof input === 'object' && !Array.isArray(input)) {
        return [input, null];
    }
    if (!Array.isArray(input)) {
        return [null, new Error('chunk-metadata: expected array tuple')];
    }
    if (input.length < 3) {
        return [null, new Error(`chunk-metadata: tuple too short: ${input.length}`)];
    }

    const [id, index, total, count = 1, stripeSize = 0, startIndex = index] = input;
    return [{
        id: String(id),
        index: Number.isInteger(index) ? index : 0,
        total: Number.isInteger(total) ? total : 1,
        count: Number.isInteger(count) ? count : 1,
        stripeSize: Number.isInteger(stripeSize) ? stripeSize : 0,
        startIndex: Number.isInteger(startIndex) ? startIndex : (index || 0)
    }, null];
}

/**
 * Serializes raw chunk data and metadata into a Format v4.1 binary slice frame.
 *
 * @param {Uint8Array} chunkData - Raw binary chunk data
 * @param {Object} metadata - Chunk and manifest metadata
 * @returns {[Uint8Array|null, Error|null]}
 */
export function serializePayloadV41(chunkData, metadata = {}) {
    if (!(chunkData instanceof Uint8Array)) {
        return [null, new Error('stego-payload: chunkData must be a Uint8Array')];
    }
    if (!metadata || typeof metadata !== 'object') {
        return [null, new Error('stego-payload: metadata must be an object')];
    }

    const checksum = crc32(chunkData) >>> 0;

    // Compact positional metadata tuple: [chunkTuple, manifestTuple, filename]
    let chunkTuple = null;
    if (metadata.chunk) {
        const [c, cErr] = packChunkMetadata(metadata.chunk);
        if (cErr) return [null, cErr];
        chunkTuple = c;
    }

    let manifestTuple = null;
    if (metadata.manifest) {
        const [m, mErr] = packManifest(metadata.manifest);
        if (mErr) return [null, mErr];
        manifestTuple = m;
    }

    const metaTuple = [
        chunkTuple,
        manifestTuple,
        metadata.filename || null
    ];

    let metaBytes;
    try {
        metaBytes = new TextEncoder().encode(JSON.stringify(metaTuple));
    } catch (e) {
        return [null, new Error(`stego-payload: metadata serialization failed: ${e.message}`)];
    }

    if (metaBytes.length > 65535) {
        return [null, new Error('stego-payload: metadata length exceeds 64KB limit')];
    }

    const totalLen = HEADER_SIZE_BYTES + metaBytes.length + chunkData.length;
    const frame = new Uint8Array(totalLen);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

    // 0: version (uint8)
    view.setUint8(0, STEGO_PAYLOAD_V41_VERSION);

    // 1..4: checksum (uint32 BE)
    view.setUint32(1, checksum, false);

    // 5..6: metaLen (uint16 BE)
    view.setUint16(5, metaBytes.length, false);

    // 7..7+metaLen: metaBytes
    frame.set(metaBytes, HEADER_SIZE_BYTES);

    // 7+metaLen..end: rawChunkBytes
    frame.set(chunkData, HEADER_SIZE_BYTES + metaBytes.length);

    return [frame, null];
}

/**
 * Parses and verifies a carrier steganographic payload, supporting both Format v4.1 binary
 * slice framing and legacy Format v4.0 JSON objects.
 *
 * @param {Uint8Array} payload
 * @returns {[{ secretData: Uint8Array, secretMetadata: Object|null }|null, Error|null]}
 */
export function parseStegoPayload(payload) {
    if (!(payload instanceof Uint8Array)) {
        return [null, new Error('stego-payload: payload must be a Uint8Array')];
    }

    // 1. Check for Format v4.1 Binary Slice Frame (starts with 0x29 = 41)
    if (payload.length > 0 && payload[0] === STEGO_PAYLOAD_V41_VERSION) {
        if (payload.byteLength < HEADER_SIZE_BYTES) {
            return [null, new Error('stego-payload: buffer shorter than 7-byte header')];
        }

        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const version = view.getUint8(0);
        if (version !== STEGO_PAYLOAD_V41_VERSION) {
            return [null, new Error(`stego-payload: unsupported version ${version}`)];
        }

        const checksum = view.getUint32(1, false);
        const metaLen = view.getUint16(5, false);

        // Explicit boundary check to prevent Uint8Array.subarray silent clamping
        if (HEADER_SIZE_BYTES + metaLen > payload.byteLength) {
            return [null, new Error('stego-payload: metaLen exceeds payload boundary')];
        }

        const metaBytes = payload.subarray(HEADER_SIZE_BYTES, HEADER_SIZE_BYTES + metaLen);
        const rawChunkBytes = payload.subarray(HEADER_SIZE_BYTES + metaLen);

        // Application-layer active integrity verification
        const computedChecksum = crc32(rawChunkBytes) >>> 0;
        if (computedChecksum !== checksum) {
            return [null, new Error(`stego-payload: checksum mismatch (expected ${checksum}, computed ${computedChecksum})`)];
        }

        let metaTuple;
        try {
            metaTuple = JSON.parse(new TextDecoder().decode(metaBytes));
        } catch (e) {
            return [null, new Error(`stego-payload: corrupted metadata JSON: ${e.message}`)];
        }

        if (!Array.isArray(metaTuple)) {
            return [null, new Error('stego-payload: expected array tuple for metadata')];
        }

        let chunkMeta = null;
        if (metaTuple[0]) {
            const [unpacked, cErr] = unpackChunkMetadata(metaTuple[0]);
            if (cErr) return [null, new Error(`stego-payload: chunk unpack failed: ${cErr.message}`)];
            chunkMeta = unpacked;
        }

        let manifestMeta = null;
        if (metaTuple[1]) {
            const [unpacked, mErr] = unpackManifest(metaTuple[1]);
            if (mErr) return [null, new Error(`stego-payload: manifest unpack failed: ${mErr.message}`)];
            manifestMeta = unpacked;
        }

        const secretMetadata = {
            chunk: chunkMeta,
            manifest: manifestMeta,
            filename: metaTuple[2] || null,
            checksum
        };

        return [{ secretData: rawChunkBytes, secretMetadata }, null];
    }

    // 2. Check for Legacy Format v4.0 JSON Object (starts with ASCII '{' = 0x7B)
    if (payload.length > 0 && payload[0] === 0x7B) {
        try {
            const parsed = JSON.parse(new TextDecoder().decode(payload));
            if (parsed && typeof parsed === 'object') {
                if (parsed.data) {
                    const [rawBytes, base64Err] = base64ToBytes(parsed.data);
                    if (base64Err || !rawBytes) {
                        return [null, base64Err || new Error('stego-payload: invalid base64 data')];
                    }
                    return [{
                        secretData: rawBytes,
                        secretMetadata: parsed.metadata || null
                    }, null];
                }
                return [{
                    secretData: payload,
                    secretMetadata: parsed.metadata || null
                }, null];
            }
        } catch {
            // Fall through if not valid JSON
        }
    }

    return [null, new Error(`stego-payload: unsupported version or payload format (first byte: 0x${payload.length > 0 ? payload[0].toString(16) : 'empty'})`)];
}
