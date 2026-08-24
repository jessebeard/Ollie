/**
 * Shared container-frame builders for tests. Hand-crafting v3 frames is
 * deliberately centralized here so format migrations touch ONE file.
 */
import { packControlHeader, encodeControlCodeword } from '../../src/information-theory/steganography/coded-header.js';
import { ErrorCorrection } from '../../src/information-theory/error-correction/rs-interleaver.js';
import { crc32 } from '../../src/utils/crc32.js';

/**
 * Builds a complete v3 frame: coded control codeword + coded body.
 *
 * @param {Object} spec
 * @param {Object} [spec.metadataObj] - JSON-serializable metadata
 * @param {Uint8Array} [spec.payload] - plaintext payload bytes
 * @param {string} [spec.profileName] - ECC profile for the body (default Medium)
 * @param {number} [spec.k] - matrix-encoding k stored in control (default 1)
 * @param {Object} [spec.override] - forged-control overrides applied AFTER
 *   computation (e.g. {payloadLen: 100000000}) for hostile-input tests
 * @returns {Uint8Array} full frame bytes ready to embedRaw()
 */
export function buildV3Container({
    metadataObj = {},
    payload = new Uint8Array(0),
    profileName = 'Medium',
    k = 1,
    override = null
} = {}) {
    const meta = new TextEncoder().encode(JSON.stringify(metadataObj));

    const crcInput = new Uint8Array(meta.length + payload.length);
    crcInput.set(meta, 0);
    crcInput.set(payload, meta.length);
    const bodyCRC32 = crc32(crcInput);

    const body = new Uint8Array(meta.length + payload.length + 4);
    body.set(meta, 0);
    body.set(payload, meta.length);
    new DataView(body.buffer).setUint32(body.length - 4, bodyCRC32, false);

    const [eccResult, eccErr] = ErrorCorrection.protect(body, profileName);
    if (eccErr) throw eccErr;

    const fields = {
        k,
        metaLen: meta.length,
        payloadLen: payload.length,
        bodyCRC32,
        profileName,
        originalLength: body.length,
        blockCount: eccResult.blockCount
    };
    if (override) Object.assign(fields, override);

    const [controlPlane] = packControlHeader(fields);
    const [codeword] = encodeControlCodeword(controlPlane);

    const frame = new Uint8Array(codeword.length + eccResult.encoded.length);
    frame.set(codeword, 0);
    frame.set(eccResult.encoded, codeword.length);
    return frame;
}
