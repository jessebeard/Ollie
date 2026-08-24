/**
 * Coded control header for container format v3.
 *
 * A fixed 191-byte control plane carrying every self-describing field the
 * reader needs (sizes, profile, block geometry) is RS(255,191)-protected so
 * coefficient corruption cannot blind the extractor: sizes/profiles survive
 * up to 32 symbol errors per codeword, and beyond-capability corruption
 * fails closed instead of mis-framing the read.
 */
import { ReedSolomonEncoder, ReedSolomonDecoder } from '../error-correction/reed-solomon-codec.js';
import { GenericGF_QR_CODE_FIELD_256 } from '../error-correction/galois-field.js';

export const CONTROL_MAGIC = 'F5SG';
export const CONTROL_VERSION = 3;
export const CONTROL_DATA_BYTES = 191;
export const CONTROL_PARITY_BYTES = 64;
export const CONTROL_CODEWORD_BYTES = CONTROL_DATA_BYTES + CONTROL_PARITY_BYTES;

const PROFILE_NAMES = ['Low', 'Medium', 'High', 'Ultra', 'Extreme'];

function isUint32(v) {
    return Number.isInteger(v) && v >= 0 && v <= 0xFFFFFFFF;
}

/**
 * Packs control fields into the fixed 191-byte plane at pinned canonical
 * offsets (big-endian; reserved tail zero-filled).
 *
 * @param {{k: number, metaLen: number, payloadLen: number, bodyCRC32: number,
 *          profileName: string, originalLength: number, blockCount: number}} fields
 * @returns {[Uint8Array|null, Error|null]}
 */
export function packControlHeader(fields) {
    if (!fields || !Number.isInteger(fields.k) || fields.k < 1 || fields.k > 4) {
        return [null, new Error('coded-header: k must be an integer in [1,4]')];
    }
    if (!PROFILE_NAMES.includes(fields.profileName)) {
        return [null, new Error(`coded-header: unknown profile ${fields.profileName}`)];
    }
    if (!Number.isInteger(fields.metaLen) || fields.metaLen < 0 || fields.metaLen > 0xFFFF) {
        return [null, new Error('coded-header: metaLen out of range')];
    }
    if (!isUint32(fields.payloadLen)) return [null, new Error('coded-header: payloadLen out of range')];
    if (!isUint32(fields.bodyCRC32)) return [null, new Error('coded-header: bodyCRC32 out of range')];
    if (!isUint32(fields.originalLength)) return [null, new Error('coded-header: originalLength out of range')];
    if (!Number.isInteger(fields.blockCount) || fields.blockCount < 1 || fields.blockCount > 0xFFFF) {
        return [null, new Error('coded-header: blockCount out of range')];
    }

    const plane = new Uint8Array(CONTROL_DATA_BYTES);
    const view = new DataView(plane.buffer);
    let off = 0;

    for (let i = 0; i < 4; i++) plane[off++] = CONTROL_MAGIC.charCodeAt(i);
    plane[off++] = CONTROL_VERSION;
    plane[off++] = 0;                       // flags reserved
    plane[off++] = fields.k;
    view.setUint16(off, fields.metaLen, false); off += 2;
    view.setUint32(off, fields.payloadLen, false); off += 4;
    view.setUint32(off, fields.bodyCRC32 >>> 0, false); off += 4;
    plane[off++] = PROFILE_NAMES.indexOf(fields.profileName);
    view.setUint32(off, fields.originalLength, false); off += 4;
    view.setUint16(off, fields.blockCount, false); off += 2;

    return [plane, null];
}

/**
 * Parses and validates a control plane. Reserved tail is ignored.
 *
 * @param {Uint8Array} plane
 * @returns {[Object|null, Error|null]}
 */
export function unpackControlHeader(plane) {
    if (!(plane instanceof Uint8Array) || plane.length !== CONTROL_DATA_BYTES) {
        return [null, new Error(`coded-header: control plane must be ${CONTROL_DATA_BYTES} bytes`) ];
    }

    const magic = String.fromCharCode(plane[0], plane[1], plane[2], plane[3]);
    if (magic !== CONTROL_MAGIC) {
        return [null, new Error(`coded-header: bad magic ${JSON.stringify(magic)}`)];
    }
    const version = plane[4];
    if (version !== CONTROL_VERSION) {
        return [null, new Error(`coded-header: unsupported version ${version}`)];
    }
    const flags = plane[5];

    const k = plane[6];
    if (!Number.isInteger(k) || k < 1 || k > 4) {
        return [null, new Error(`coded-header: invalid k ${k}`)];
    }

    const view = new DataView(plane.buffer, plane.byteOffset, plane.byteLength);
    const metaLen = view.getUint16(7, false);
    const payloadLen = view.getUint32(9, false);
    const bodyCRC32 = view.getUint32(13, false);

    const profileIdx = plane[17];
    const profileName = PROFILE_NAMES[profileIdx];
    if (profileName === undefined) {
        return [null, new Error(`coded-header: unknown profile enum ${profileIdx}`)];
    }

    const originalLength = view.getUint32(18, false);
    const blockCount = view.getUint16(22, false);
    if (blockCount < 1) return [null, new Error('coded-header: invalid blockCount')];

    return [{
        magic,
        version,
        flags,
        k,
        metaLen,
        payloadLen,
        bodyCRC32,
        profileName,
        originalLength,
        blockCount
    }, null];
}

/**
 * RS-encodes the control plane into a single 255-symbol codeword
 * (191 data + 64 parity).
 *
 * @param {Uint8Array} plane
 * @returns {[Uint8Array|null, Error|null]}
 */
export function encodeControlCodeword(plane) {
    if (!(plane instanceof Uint8Array) || plane.length !== CONTROL_DATA_BYTES) {
        return [null, new Error(`coded-header: plane must be ${CONTROL_DATA_BYTES} bytes`)];
    }
    try {
        const block = new Int32Array(CONTROL_CODEWORD_BYTES);
        for (let i = 0; i < CONTROL_DATA_BYTES; i++) block[i] = plane[i];
        const encoder = new ReedSolomonEncoder(GenericGF_QR_CODE_FIELD_256);
        encoder.encode(block, CONTROL_PARITY_BYTES);

        const codeword = new Uint8Array(CONTROL_CODEWORD_BYTES);
        for (let i = 0; i < CONTROL_CODEWORD_BYTES; i++) codeword[i] = block[i];
        return [codeword, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Mechanically corrects and strips an encoded control codeword back to its
 * 191-byte plane. Beyond-capability corruption yields an error tuple -
 * chain with unpackControlHeader for validation.
 *
 * @param {Uint8Array} codeword
 * @returns {[Uint8Array|null, Error|null]}
 */
export function decodeControlCodeword(codeword) {
    if (!(codeword instanceof Uint8Array) || codeword.length !== CONTROL_CODEWORD_BYTES) {
        return [null, new Error(`coded-header: codeword must be ${CONTROL_CODEWORD_BYTES} bytes`)];
    }
    try {
        const block = new Int32Array(CONTROL_CODEWORD_BYTES);
        for (let i = 0; i < CONTROL_CODEWORD_BYTES; i++) block[i] = codeword[i];
        const decoder = new ReedSolomonDecoder(GenericGF_QR_CODE_FIELD_256);
        decoder.decode(block, CONTROL_PARITY_BYTES);

        const plane = new Uint8Array(CONTROL_DATA_BYTES);
        for (let i = 0; i < CONTROL_DATA_BYTES; i++) plane[i] = block[i];
        return [plane, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}
