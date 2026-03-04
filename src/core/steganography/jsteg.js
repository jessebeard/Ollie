/**
 * Jsteg Steganography Implementation
 * 
 * Implements the Jsteg algorithm for hiding data in JPEG coefficients.
 * Jsteg embeds data in the Least Significant Bit (LSB) of non-zero quantized DCT coefficients.
 * It skips:
 * - DC coefficients (index 0 of each block) to preserve overall luminance/color.
 * - Coefficients with value 0 or 1 (though some variants use 1, standard Jsteg usually skips 0 and 1 to avoid ambiguity, but simple LSB replacement on non-zeros is common. Let's stick to: skip 0s, and maybe skip 1s if it causes issues, but usually just skip 0s is the definition of "non-zero". Wait, Jsteg specifically skips 0 and 1?
 * 
 * Actually, the classic Jsteg algorithm:
 * - Sequential embedding.
 * - Skips DC coefficients.
 * - Skips AC coefficients that are 0 or 1.
 * - Replaces LSB of other coefficients.
 * 
 * However, skipping 1s reduces capacity significantly. A simpler variant is "LSB of non-zeros".
 * Let's implement "LSB of non-zeros" first (skipping only 0). If we encounter issues, we can refine.
 * Actually, let's stick to skipping 0s only for max capacity for now, unless we find a reason not to.
 * 
 * Data Format:
 * [Length (32-bit BE)][Data Payload]
 */
import { ErrorCorrection, ECC_PROFILES } from './error-correction.js';
import { Encryption } from '../crypto/encryption.js';
import { KeyDerivation } from '../crypto/key-derivation.js';
import { crc32 } from '../../utils/crc32.js';

export class Jsteg {
    /**
     * Embeds data into the provided blocks.
     * Modifies the blocks in-place.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks - Array of 8x8 blocks (64 elements each)
     * @param {Uint8Array} data - Data to embed
     * @returns {boolean} True if successful, false if data didn't fit
     */
    /**
     * Gets the Huffman category for a coefficient value.
     * Category determines how many bits are needed to encode the magnitude.
     * 
     * @param {number} absVal - Absolute value of coefficient
     * @returns {number} Category (0-10+)
     */
    static getCategory(absVal) {
        if (absVal === 0) return 0;
        // 1 is now a valid category for embedding (mapped to 2/3)
        if (absVal === 1) return 1;
        if (absVal <= 3) return 2;
        if (absVal <= 7) return 3;
        if (absVal <= 15) return 4;
        if (absVal <= 31) return 5;
        if (absVal <= 63) return 6;
        if (absVal <= 127) return 7;
        if (absVal <= 255) return 8;
        if (absVal <= 511) return 9;
        if (absVal <= 1023) return 10;
        return 11;
    }

    /**
     * Embeds raw data into the provided blocks without adding a length header.
     * Uses category-aware embedding to prevent Huffman encoding expansion.
     * Modifies the blocks in-place.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks - Array of 8x8 blocks
     * @param {Uint8Array} data - Data to embed
     * @returns {boolean} True if successful, false if data didn't fit
     */
    static embedRaw(blocks, data) {
        let byteIndex = 0;
        let bitIndex = 0;

        for (const block of blocks) {

            for (let i = 1; i < 64; i++) {
                if (byteIndex >= data.length) {
                    return true;
                }

                const val = block[i];
                const absVal = Math.abs(val);

                if (val === 0) continue;

                // We now support embedding in 1s by mapping them to 2 or 3
                // This avoids creating 0s (which would be skipped by decoder)

                const bit = (data[byteIndex] >> (7 - bitIndex)) & 1;

                if (absVal === 1) {
                    // Map 1 -> 2 (bit 0) or 3 (bit 1)
                    // Map -1 -> -2 (bit 0) or -3 (bit 1)
                    if (val > 0) {
                        block[i] = bit === 1 ? 3 : 2;
                    } else {
                        block[i] = bit === 1 ? -3 : -2;
                    }
                } else if (absVal === 2) {

                    if (val > 0) {
                        block[i] = bit === 1 ? 3 : 2;
                    } else {
                        block[i] = bit === 1 ? -3 : -2;
                    }
                } else if (absVal === 3) {

                    if (val > 0) {
                        block[i] = (val & ~1) | bit;
                    } else {
                        block[i] = -(Math.abs(val & ~1) | bit);
                    }
                } else {

                    if (val > 0) {
                        block[i] = (val & ~1) | bit;
                    } else {
                        block[i] = -(Math.abs(val & ~1) | bit);
                    }
                }

                bitIndex++;
                if (bitIndex === 8) {
                    bitIndex = 0;
                    byteIndex++;
                }
            }
        }

        return false;
    }

    /**
     * Embeds data into the provided blocks.
     * Modifies the blocks in-place.
     * Legacy format: [Length (32-bit BE)][Data Payload]
     * 
     * @param {Array<Int32Array|Float32Array>} blocks - Array of 8x8 blocks (64 elements each)
     * @param {Uint8Array} data - Data to embed
     * @returns {boolean} True if successful, false if data didn't fit
     */
    static embed(blocks, data) {

        const dataWithHeader = new Uint8Array(data.length + 4);
        const view = new DataView(dataWithHeader.buffer);
        view.setUint32(0, data.length, false);
        dataWithHeader.set(data, 4);

        return this.embedRaw(blocks, dataWithHeader);
    }

    /**
     * Embeds data using the new container format.
     * Format: [Magic:4][Version:1][Flags:1][MetaLen:2][Metadata:N][PayloadLen:4][Payload:N][CRC:4]
     * 
     * @param {Array<Int32Array|Float32Array>} blocks 
     * @param {Uint8Array} data 
     * @param {Object} metadata 
     */
    /**
     * Embeds data using the new container format.
     * Format: [Magic:4][Version:1][Flags:1][MetaLen:2][Metadata:N][PayloadLen:4][Payload:N][CRC:4]
     * 
     * @param {Array<Int32Array|Float32Array>} blocks 
     * @param {Uint8Array} data 
     * @param {Object} metadata 
     * @param {Object} options - { password: '...' }
     */
    static async embedContainer(blocks, data, metadata, options = {}) {
        const magic = new TextEncoder().encode('JSTG');
        const version = 1;
        const flags = 0;

        let payloadToEmbed = data;
        if (options.password) {
            metadata.encrypted = true;
            const [salt, saltErr] = KeyDerivation.generateSalt();
            if (saltErr) {
                console.error('Jsteg: Salt generation failed:', saltErr);
                return false;
            }
            const [key, keyErr] = await KeyDerivation.deriveKey(options.password, salt);
            if (keyErr) {
                console.error('Jsteg: Key derivation failed:', keyErr);
                return false;
            }
            const [encResult, encErr] = await Encryption.encrypt(data, key);
            if (encErr) {
                console.error('Jsteg: Encryption failed:', encErr);
                return false;
            }
            const { ciphertext, iv } = encResult;

            const encryptedPayload = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
            encryptedPayload.set(salt, 0);
            encryptedPayload.set(iv, salt.length);
            encryptedPayload.set(new Uint8Array(ciphertext), salt.length + iv.length);

            payloadToEmbed = encryptedPayload;
        }

        let protectedPayload = payloadToEmbed;
        if (metadata.ecc) {

            const eccProfile = metadata.eccProfile || 'Medium';
            const [eccResult, eccErr] = ErrorCorrection.protect(payloadToEmbed, eccProfile);
            if (eccErr) {
                console.error('ECC protection failed:', eccErr);
                return null;
            }
            protectedPayload = eccResult.encoded;

            metadata.eccProfile = eccProfile;
            metadata.originalLength = eccResult.originalLength;
            metadata.blockCount = eccResult.blockCount;
        }
        const payloadLen = protectedPayload.length;

        const metaStr = JSON.stringify(metadata);
        const metaBytes = new TextEncoder().encode(metaStr);
        const metaLen = metaBytes.length;

        const totalSize = 4 + 1 + 1 + 2 + metaLen + 4 + payloadLen + 4;

        const container = new Uint8Array(totalSize);
        const view = new DataView(container.buffer);
        let offset = 0;

        container.set(magic, offset);
        offset += 4;

        view.setUint8(offset, version);
        offset += 1;

        view.setUint8(offset, flags);
        offset += 1;

        view.setUint16(offset, metaLen, false);
        offset += 2;

        container.set(metaBytes, offset);
        offset += metaLen;

        view.setUint32(offset, payloadLen, false);
        offset += 4;

        container.set(protectedPayload, offset);
        offset += payloadLen;

        const dataToCrc = container.subarray(0, offset);
        const crcVal = crc32(dataToCrc);

        view.setUint32(offset, crcVal, false);
        offset += 4;

        return this.embedRaw(blocks, container);
    }

    /**
     * Auto-detects format and extracts data.
     * Returns Uint8Array for legacy format, or {data, metadata} for container format.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks 
     * @param {Object} options
     * @returns {Promise<Uint8Array|Object|null>}
     */
    static async extractAuto(blocks, options = {}) {
        const reader = new JstegReader(blocks);
        const magicBytes = reader.readBytes(4);

        if (!magicBytes) return null;

        const magic = new TextDecoder().decode(magicBytes);

        if (magic === 'JSTG') {
            return this.extractContainer(blocks, options);
        } else {
            return this.extract(blocks);
        }
    }

    /**
     * Extracts data from the provided blocks using the new container format.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks 
     * @param {Object} options
     * @returns {Promise<Object|null>} { data, metadata } or null if invalid
     */
    static async extractContainer(blocks, options = {}) {
        const reader = new JstegReader(blocks);

        const magicBytes = reader.readBytes(4);
        if (!magicBytes) return null;
        const magic = new TextDecoder().decode(magicBytes);
        if (magic !== 'JSTG') return null;

        const version = reader.readByte();
        if (version === null || version !== 1) return null;

        const flags = reader.readByte();
        if (flags === null) return null;

        const metaLenBytes = reader.readBytes(2);
        if (!metaLenBytes) return null;
        const metaLen = (metaLenBytes[0] << 8) | metaLenBytes[1];

        const metaBytes = reader.readBytes(metaLen);
        if (!metaBytes) return null;
        let metadata;
        try {
            metadata = JSON.parse(new TextDecoder().decode(metaBytes));
        } catch (e) {
            return null;
        }

        const payloadLenBytes = reader.readBytes(4);
        if (!payloadLenBytes) return null;
        const payloadLen = ((payloadLenBytes[0] << 24) | (payloadLenBytes[1] << 16) | (payloadLenBytes[2] << 8) | payloadLenBytes[3]) >>> 0;

        if (payloadLen > 100 * 1024 * 1024) {
            return null;
        }

        let payload = reader.readBytes(payloadLen);
        if (!payload) return null;

        const crcBytes = reader.readBytes(4);
        if (!crcBytes) return null;
        const expectedCrc = ((crcBytes[0] << 24) | (crcBytes[1] << 16) | (crcBytes[2] << 8) | crcBytes[3]) >>> 0;

        const totalSize = 4 + 1 + 1 + 2 + metaLen + 4 + payloadLen;
        const checkBuffer = new Uint8Array(totalSize);
        const checkView = new DataView(checkBuffer.buffer);
        let checkOffset = 0;

        checkBuffer.set(magicBytes, checkOffset); checkOffset += 4;
        checkBuffer.set([version], checkOffset); checkOffset += 1;
        checkBuffer.set([flags], checkOffset); checkOffset += 1;
        checkView.setUint16(checkOffset, metaLen, false); checkOffset += 2;
        checkBuffer.set(metaBytes, checkOffset); checkOffset += metaLen;
        checkView.setUint32(checkOffset, payloadLen, false); checkOffset += 4;
        checkBuffer.set(payload, checkOffset); checkOffset += payloadLen;

        const actualCrc = crc32(checkBuffer);

        if (actualCrc !== expectedCrc) {
            if (!metadata.ecc) {
                return null;
            }
            console.warn('CRC mismatch, attempting ECC recovery...');
        }

        if (metadata.ecc) {

            if (metadata.eccProfile && metadata.originalLength !== undefined) {
                const [recovered, recoverErr] = ErrorCorrection.recover(
                    payload,
                    metadata.eccProfile,
                    metadata.originalLength,
                    metadata.blockCount
                );
                if (recoverErr) {
                    console.error('ECC recovery failed:', recoverErr);
                    return null;
                }
                payload = recovered;
            } else {

                payload = ErrorCorrection.recover(payload);
            }
        }

        if (metadata.encrypted) {
            if (!options.password) {
                console.warn('Data is encrypted but no password provided.');
                return null;
            }

            try {

                const salt = payload.slice(0, 16);
                const iv = payload.slice(16, 28);
                const ciphertext = payload.slice(28);

                const [key, keyErr] = await KeyDerivation.deriveKey(options.password, salt);
                if (keyErr) {
                    console.error('Decryption failed:', keyErr);
                    return null;
                }
                const [decryptedPayload, decErr] = await Encryption.decrypt(ciphertext, key, iv);
                if (decErr) {
                    console.error('Decryption failed:', decErr);
                    return null;
                }
                payload = decryptedPayload;
            } catch (e) {
                console.error('Decryption error:', e);
                return null;
            }
        }

        return {
            data: payload,
            metadata: metadata
        };
    }

    /**
     * Extracts data from the provided blocks.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks - Array of 8x8 blocks
     * @returns {Uint8Array|null} Extracted data or null if invalid
     */
    static extract(blocks) {

        let length = 0;
        let lengthBits = 0;
        let data = null;
        let byteIndex = 0;
        let bitIndex = 0;
        let totalBitsRead = 0;

        let state = 0;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                const val = block[i];
                if (val === 0) continue;

                const bit = val & 1;
                totalBitsRead++;

                if (state === 0) {

                    length = (length << 1) | bit;
                    lengthBits++;
                    if (lengthBits === 32) {

                        length = length >>> 0;

                        if (length > 100 * 1024 * 1024) {
                            console.warn('Jsteg: Invalid length detected:', length);
                            return null;
                        }
                        data = new Uint8Array(length);
                        if (length === 0) return data;
                        state = 1;
                    }
                } else {

                    if (byteIndex < length) {
                        data[byteIndex] = (data[byteIndex] << 1) | bit;
                        bitIndex++;
                        if (bitIndex === 8) {
                            bitIndex = 0;
                            byteIndex++;
                            if (byteIndex === length) {

                                return data;
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Calculates the maximum capacity in bytes for the given blocks.
     * Accounts for category-aware embedding that skips |val|=1 coefficients.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks 
     * @param {Object} options - { format: 'legacy'|'container', metadata: {}, ecc: bool, encrypted: bool }
     * @returns {number} Capacity in bytes (available for payload)
     */
    static calculateCapacity(blocks, options = {}) {
        let capacityBits = 0;
        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                const val = block[i];
                const absVal = Math.abs(val);

                if (val === 0) continue;

                // Include 1s in capacity now
                // if (absVal === 1) continue;

                capacityBits++;
            }
        }

        const capacityBytes = Math.floor(capacityBits / 8);

        if (options.format === 'container') {

            let metaStr = JSON.stringify(options.metadata || {});

            const eccMetadataOverhead = options.ecc ? 70 : 0;

            const metaLen = new TextEncoder().encode(metaStr).length + eccMetadataOverhead;
            let containerOverhead = 4 + 1 + 1 + 2 + metaLen + 4 + 4;

            const encryptionOverhead = options.encrypted ? 28 : 0;

            if (options.ecc) {
                const eccProfile = options.eccProfile || 'Medium';
                const profile = ECC_PROFILES[eccProfile];

                const minEncodedSize = 255;

                const availableForECC = capacityBytes - containerOverhead;

                if (availableForECC < minEncodedSize) {

                    return 0;
                }

                const maxBlocks = Math.floor(availableForECC / 255);

                const maxPayloadWithECC = maxBlocks * profile.dataBytes;

                return Math.max(0, maxPayloadWithECC - encryptionOverhead);
            } else {

                const availableForPayload = capacityBytes - containerOverhead - encryptionOverhead;
                return Math.max(0, availableForPayload);
            }
        } else {

            return Math.max(0, capacityBytes - 4);
        }
    }
}

class JstegReader {
    constructor(blocks) {
        this.blocks = blocks;
        this.blockIndex = 0;
        this.pixelIndex = 1;
        this.bitCount = 0;
    }

    readBit() {
        while (this.blockIndex < this.blocks.length) {
            const block = this.blocks[this.blockIndex];
            while (this.pixelIndex < 64) {
                const val = block[this.pixelIndex];
                this.pixelIndex++;

                if (val === 0) continue;

                // We now support reading from 1s (which were mapped to 2/3 during embedding)
                // But wait, if we read a raw file that wasn't embedded, we might see 1s.
                // If we see a 1, it means it wasn't touched by our new embedder (which maps 1->2/3).
                // But for extraction, we just read the LSB. 
                // 1 & 1 = 1. -1 & 1 = 1.
                // So we can read from 1s too.

                // if (Math.abs(val) === 1) continue;

                this.bitCount++;
                return val & 1;
            }
            this.pixelIndex = 1;
            this.blockIndex++;
        }
        return null;
    }

    readByte() {
        let byte = 0;
        for (let i = 0; i < 8; i++) {
            const bit = this.readBit();
            if (bit === null) return null;
            byte = (byte << 1) | bit;
        }
        return byte;
    }

    readBytes(count) {
        const bytes = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            const byte = this.readByte();
            if (byte === null) return null;
            bytes[i] = byte;
        }
        return bytes;
    }
}
