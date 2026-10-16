import {
    ReedSolomonEncoder,
    ReedSolomonDecoder,
    GenericGF_QR_CODE_FIELD_256
} from './index.js';

/**
 * ECC Profiles for Reed-Solomon encoding.
 * All profiles use RS(255, k) over GF(256).
 * 
 * | Profile  | Data (k) | Parity | Overhead | Correctable Symbols |
 * |----------|----------|--------|----------|---------------------|
 * | Low      | 251      | 4      | 1.6%     | 2                   |
 * | Medium   | 223      | 32     | 14%      | 16                  |
 * | High     | 191      | 64     | 33%      | 32                  |
 * | Ultra    | 127      | 128    | 100%     | 64                  |
 * | Extreme  | 85       | 170    | 200%     | 85                  |
 */
export const ECC_PROFILES = {
    Low: { dataBytes: 251, parityBytes: 4 },
    Medium: { dataBytes: 223, parityBytes: 32 },
    High: { dataBytes: 191, parityBytes: 64 },
    Ultra: { dataBytes: 127, parityBytes: 128 },
    Extreme: { dataBytes: 85, parityBytes: 170 }
};

const BLOCK_SIZE = 255;

/**
 * ErrorCorrection - Robust Reed-Solomon wrapper with chunking and interleaving
 */
export class ErrorCorrection {

    static FIELD = GenericGF_QR_CODE_FIELD_256;

    static DEFAULT_PARITY_BYTES = 4;

    /**
     * Protects data using the specified ECC profile.
     * Handles large payloads by chunking into RS(255, k) blocks.
     * Applies interleaving for burst error resistance.
     * 
     * @param {Uint8Array} data - Original data
     * @param {string|number} profileOrParity - Profile name ('Low', 'Medium', etc.) or legacy parity bytes count
     *                                          If not provided, uses legacy behavior (4 parity bytes)
     * @returns {[Object|Uint8Array|null, Error|null]} Tuple: profile mode { encoded, originalLength, profile, blockCount }, legacy mode Uint8Array
     */
    static protect(data, profileOrParity = null) {

        if (profileOrParity === null) {
            return this._protectLegacy(data, this.DEFAULT_PARITY_BYTES);
        }
        if (typeof profileOrParity === 'number') {
            return this._protectLegacy(data, profileOrParity);
        }

        const profileName = profileOrParity;
        const profile = ECC_PROFILES[profileName];
        if (!profile) {
            return [null, new Error(`Unknown ECC profile: ${profileName}`)];
        }

        const { dataBytes, parityBytes } = profile;
        const encoder = new ReedSolomonEncoder(this.FIELD);
        const originalLength = data.length;

        const blockCount = Math.ceil(data.length / dataBytes);

        const blocks = [];
        for (let i = 0; i < blockCount; i++) {
            const start = i * dataBytes;
            const end = Math.min(start + dataBytes, data.length);
            const chunkLength = end - start;

            const block = new Int32Array(BLOCK_SIZE);
            for (let j = 0; j < chunkLength; j++) {
                block[j] = data[start + j];
            }

            encoder.encode(block, parityBytes);
            blocks.push(block);
        }

        const interleaved = this._interleave(blocks, blockCount, BLOCK_SIZE);

        return [{
            encoded: interleaved,
            originalLength,
            profile: profileName,
            blockCount
        }, null];
    }

    /**
     * Recovers original data from ECC-protected payload.
     * Handles de-interleaving and multi-block decoding.
     * 
     * @param {Uint8Array} encoded - Interleaved encoded data
     * @param {string|number} profileOrParity - Profile name or legacy parity bytes
     *                                          If not provided, uses legacy behavior
     * @param {number} originalLength - Original data length (for padding removal)
     * @param {number} blockCount - Number of RS blocks (optional, calculated if not provided)
     * @returns {[Uint8Array|null, Error|null]} Tuple of [recoveredData, error]
     */
    static recover(encoded, profileOrParity = null, originalLength = null, blockCount = null) {

        if (profileOrParity === null) {
            return this._recoverLegacy(encoded, this.DEFAULT_PARITY_BYTES);
        }
        if (typeof profileOrParity === 'number') {
            return this._recoverLegacy(encoded, profileOrParity);
        }

        const profileName = profileOrParity;
        const profile = ECC_PROFILES[profileName];
        if (!profile) {
            return [null, new Error(`Unknown ECC profile: ${profileName}`)];
        }

        const { dataBytes, parityBytes } = profile;
        const decoder = new ReedSolomonDecoder(this.FIELD);

        if (blockCount === null || blockCount === undefined) {
            blockCount = Math.floor(encoded.length / BLOCK_SIZE);
        }

        const maxBlocks = Math.floor(encoded.length / BLOCK_SIZE);
        if (!Number.isInteger(blockCount) || blockCount < 1 || blockCount > maxBlocks) {
            return [null, new Error(`Invalid block count ${blockCount} for encoded payload of ${encoded.length} bytes`)];
        }

        if (originalLength !== null && originalLength !== undefined) {
            if (!Number.isInteger(originalLength) || originalLength < 0 || originalLength > blockCount * dataBytes) {
                return [null, new Error(`Invalid original length ${originalLength} for ${blockCount} block(s) of ${dataBytes} data bytes`)];
            }
        }

        const blocks = this._deinterleave(encoded, blockCount, BLOCK_SIZE);

        const recoveredChunks = [];
        for (let i = 0; i < blockCount; i++) {
            const block = blocks[i];
            const [, decErr] = decoder.decodeTuple(block, parityBytes);
            if (decErr) {
                return [null, new Error(`ECC recovery failed on block ${i}: ${decErr.message}`)];
            }

            const chunk = new Uint8Array(dataBytes);
            for (let j = 0; j < dataBytes; j++) {
                chunk[j] = block[j];
            }
            recoveredChunks.push(chunk);
        }

        const totalRecovered = blockCount * dataBytes;
        const result = new Uint8Array(originalLength !== null ? originalLength : totalRecovered);
        let offset = 0;
        for (const chunk of recoveredChunks) {
            const copyLength = Math.min(chunk.length, result.length - offset);
            result.set(chunk.subarray(0, copyLength), offset);
            offset += copyLength;
            if (offset >= result.length) break;
        }

        return [result, null];
    }

    /**
     * Interleaves bytes across blocks to spread burst errors.
     * Conceptually transposes the block matrix.
     * 
     * @param {Int32Array[]} blocks - Array of encoded blocks
     * @param {number} blockCount - Number of blocks
     * @param {number} blockSize - Size of each block (255)
     * @returns {Uint8Array} Interleaved data
     */
    static _interleave(blocks, blockCount, blockSize) {
        const totalLength = blockCount * blockSize;
        const result = new Uint8Array(totalLength);

        for (let bytePos = 0; bytePos < blockSize; bytePos++) {
            for (let blockIdx = 0; blockIdx < blockCount; blockIdx++) {
                result[bytePos * blockCount + blockIdx] = blocks[blockIdx][bytePos];
            }
        }

        return result;
    }

    /**
     * De-interleaves data back into separate blocks.
     * 
     * @param {Uint8Array} interleaved - Interleaved data
     * @param {number} blockCount - Number of blocks
     * @param {number} blockSize - Size of each block (255)
     * @returns {Int32Array[]} Array of blocks
     */
    static _deinterleave(interleaved, blockCount, blockSize) {
        const blocks = [];
        for (let i = 0; i < blockCount; i++) {
            blocks.push(new Int32Array(blockSize));
        }

        for (let bytePos = 0; bytePos < blockSize; bytePos++) {
            for (let blockIdx = 0; blockIdx < blockCount; blockIdx++) {
                blocks[blockIdx][bytePos] = interleaved[bytePos * blockCount + blockIdx];
            }
        }

        return blocks;
    }

    /**
     * Legacy protect method for backward compatibility.
     * Single block, no interleaving.
     *
     * @returns {[Uint8Array|null, Error|null]} Tuple of [encodedData, error]
     */
    static _protectLegacy(data, parityBytes) {
        const encoder = new ReedSolomonEncoder(this.FIELD);
        const totalLength = data.length + parityBytes;
        const toEncode = new Int32Array(totalLength);

        for (let i = 0; i < data.length; i++) {
            toEncode[i] = data[i];
        }

        encoder.encode(toEncode, parityBytes);

        const result = new Uint8Array(totalLength);
        for (let i = 0; i < totalLength; i++) {
            result[i] = toEncode[i];
        }

        return [result, null];
    }

    /**
     * Legacy recover method for backward compatibility.
     * Single block, no interleaving.
     *
     * @returns {[Uint8Array|null, Error|null]} Tuple of [recoveredData, error]
     */
    static _recoverLegacy(receivedData, parityBytes) {
        if (receivedData.length < parityBytes) {
            return [null, new Error(`ECC recovery failed: payload length ${receivedData.length} is shorter than parity length ${parityBytes}`)];
        }

        const decoder = new ReedSolomonDecoder(this.FIELD);
        const toDecode = new Int32Array(receivedData.length);

        for (let i = 0; i < receivedData.length; i++) {
            toDecode[i] = receivedData[i];
        }

        const [, decErr] = decoder.decodeTuple(toDecode, parityBytes);
        if (decErr) {
            return [null, new Error(`ECC recovery failed on legacy block: ${decErr.message}`)];
        }

        const dataLength = receivedData.length - parityBytes;
        const result = new Uint8Array(dataLength);
        for (let i = 0; i < dataLength; i++) {
            result[i] = toDecode[i];
        }

        return [result, null];
    }

    /**
     * Calculates the overhead multiplier for a given profile.
     * 
     * @param {string} profileName - Profile name
     * @returns {number} Overhead multiplier (e.g., 1.14 for 14% overhead)
     */
    static getOverheadMultiplier(profileName) {
        const profile = ECC_PROFILES[profileName];
        if (!profile) return 1.0;
        return BLOCK_SIZE / profile.dataBytes;
    }

    /**
     * Calculates the encoded size for a given data length and profile.
     * 
     * @param {number} dataLength - Original data length
     * @param {string} profileName - Profile name
     * @returns {number} Encoded size in bytes
     */
    static calculateEncodedSize(dataLength, profileName) {
        const profile = ECC_PROFILES[profileName];
        if (!profile) return dataLength;
        const blockCount = Math.ceil(dataLength / profile.dataBytes);
        return blockCount * BLOCK_SIZE;
    }
}
