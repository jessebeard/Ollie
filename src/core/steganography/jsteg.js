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
import { ErrorCorrection } from './error-correction.js';
import { Encryption } from '../crypto/encryption.js';
import { KeyDerivation } from '../crypto/key-derivation.js';

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
     * Embeds raw data into the provided blocks without adding a length header.
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
            // Skip DC (index 0)
            for (let i = 1; i < 64; i++) {
                if (byteIndex >= data.length) {
                    return true; // Done
                }

                const val = block[i];

                // Skip zeros
                if (val === 0) continue;

                // Get current bit to embed
                const bit = (data[byteIndex] >> (7 - bitIndex)) & 1;

                // Embed bit into LSB
                if (val === 1) {
                    if (bit === 0) block[i] = 2;
                } else if (val === -1) {
                    if (bit === 0) block[i] = -2;
                } else {
                    block[i] = (val & ~1) | bit;
                }

                bitIndex++;
                if (bitIndex === 8) {
                    bitIndex = 0;
                    byteIndex++;
                }
            }
        }

        return false; // Ran out of space
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
        // Prepare data stream with length header
        const dataWithHeader = new Uint8Array(data.length + 4);
        const view = new DataView(dataWithHeader.buffer);
        view.setUint32(0, data.length, false); // Big Endian length
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

        // 0. Encryption (if password provided)
        let payloadToEmbed = data;
        if (options.password) {
            metadata.encrypted = true;
            const salt = KeyDerivation.generateSalt();
            const key = await KeyDerivation.deriveKey(options.password, salt);
            const { ciphertext, iv } = await Encryption.encrypt(data, key);

            // Construct encrypted payload: [Salt(16)][IV(12)][Ciphertext(N)]
            const encryptedPayload = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
            encryptedPayload.set(salt, 0);
            encryptedPayload.set(iv, salt.length);
            encryptedPayload.set(new Uint8Array(ciphertext), salt.length + iv.length);

            payloadToEmbed = encryptedPayload;
        }

        const metaStr = JSON.stringify(metadata);
        const metaBytes = new TextEncoder().encode(metaStr);
        const metaLen = metaBytes.length;

        // Prepare Payload (with ECC if enabled)
        let protectedPayload = payloadToEmbed;
        if (metadata.ecc) {
            protectedPayload = ErrorCorrection.protect(payloadToEmbed);
        }
        const payloadLen = protectedPayload.length;

        // Calculate total size
        // Magic(4) + Ver(1) + Flags(1) + MetaLen(2) + Meta(N) + PayloadLen(4) + Payload(N) + CRC(4)
        const totalSize = 4 + 1 + 1 + 2 + metaLen + 4 + payloadLen + 4;

        const container = new Uint8Array(totalSize);
        const view = new DataView(container.buffer);
        let offset = 0;

        // Magic
        container.set(magic, offset);
        offset += 4;

        // Version
        view.setUint8(offset, version);
        offset += 1;

        // Flags
        view.setUint8(offset, flags);
        offset += 1;

        // Metadata Length
        view.setUint16(offset, metaLen, false); // BE
        offset += 2;

        // Metadata
        container.set(metaBytes, offset);
        offset += metaLen;

        // Payload Length
        view.setUint32(offset, payloadLen, false); // BE
        offset += 4;

        // Payload
        container.set(protectedPayload, offset);
        offset += payloadLen;

        // CRC32
        // Calculate CRC over everything before the CRC field (Magic...Payload)
        const dataToCrc = container.subarray(0, offset);
        const crc = this.crc32(dataToCrc);

        view.setUint32(offset, crc, false);
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
        // Peek at first 4 bytes to check for magic
        const reader = new JstegReader(blocks);
        const magicBytes = reader.readBytes(4);

        if (!magicBytes) return null;

        const magic = new TextDecoder().decode(magicBytes);

        if (magic === 'JSTG') {
            // Container format - use extractContainer
            return this.extractContainer(blocks, options);
        } else {
            // Legacy format - use extract
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

        // 1. Magic (4 bytes)
        const magicBytes = reader.readBytes(4);
        if (!magicBytes) return null;
        const magic = new TextDecoder().decode(magicBytes);
        if (magic !== 'JSTG') return null;

        // 2. Version (1 byte)
        const version = reader.readByte();
        if (version === null || version !== 1) return null;

        // 3. Flags (1 byte)
        const flags = reader.readByte();
        if (flags === null) return null;

        // 4. Metadata Length (2 bytes)
        const metaLenBytes = reader.readBytes(2);
        if (!metaLenBytes) return null;
        const metaLen = (metaLenBytes[0] << 8) | metaLenBytes[1];

        // 5. Metadata (N bytes)
        const metaBytes = reader.readBytes(metaLen);
        if (!metaBytes) return null;
        let metadata;
        try {
            metadata = JSON.parse(new TextDecoder().decode(metaBytes));
        } catch (e) {
            return null;
        }

        // 6. Payload Length (4 bytes)
        const payloadLenBytes = reader.readBytes(4);
        if (!payloadLenBytes) return null;
        const payloadLen = ((payloadLenBytes[0] << 24) | (payloadLenBytes[1] << 16) | (payloadLenBytes[2] << 8) | payloadLenBytes[3]) >>> 0;

        // Sanity check length
        if (payloadLen > 100 * 1024 * 1024) { // 100MB limit
            return null;
        }

        // 7. Payload (N bytes)
        let payload = reader.readBytes(payloadLen);
        if (!payload) return null;

        // 8. CRC (4 bytes)
        const crcBytes = reader.readBytes(4);
        if (!crcBytes) return null;
        const expectedCrc = ((crcBytes[0] << 24) | (crcBytes[1] << 16) | (crcBytes[2] << 8) | crcBytes[3]) >>> 0;

        // Verify CRC
        // Reconstruct the data stream to calculate CRC
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

        const actualCrc = this.crc32(checkBuffer);

        if (actualCrc !== expectedCrc) {
            // CRC failed. If ECC is enabled, try to recover.
            if (!metadata.ecc) {
                return null;
            }
            console.warn('CRC mismatch, attempting ECC recovery...');
        }

        // If ECC is enabled, recover data (strips parity and fixes errors)
        if (metadata.ecc) {
            try {
                payload = ErrorCorrection.recover(payload);
            } catch (e) {
                console.error('ECC recovery failed:', e);
                return null;
            }
        }

        // Decryption
        if (metadata.encrypted) {
            if (!options.password) {
                console.warn('Data is encrypted but no password provided.');
                return null;
            }

            try {
                // Parse [Salt(16)][IV(12)][Ciphertext(N)]
                const salt = payload.slice(0, 16);
                const iv = payload.slice(16, 28);
                const ciphertext = payload.slice(28);

                const key = await KeyDerivation.deriveKey(options.password, salt);
                payload = await Encryption.decrypt(ciphertext, key, iv);
            } catch (e) {
                console.error('Decryption failed:', e);
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
        // console.log(`Jsteg.extract: Processing ${blocks.length} blocks`);
        let length = 0;
        let lengthBits = 0;
        let data = null;
        let byteIndex = 0;
        let bitIndex = 0;
        let totalBitsRead = 0;

        // State machine: 0=Reading Length, 1=Reading Data
        let state = 0;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                const val = block[i];
                if (val === 0) continue;

                const bit = val & 1;
                totalBitsRead++;

                if (state === 0) {
                    // Reading Length (32 bits)
                    length = (length << 1) | bit;
                    lengthBits++;
                    if (lengthBits === 32) {
                        // console.log(`Jsteg.extract: Raw length value before unsigned conversion: ${length}`);
                        length = length >>> 0; // Treat as unsigned 32-bit integer
                        // console.log(`Jsteg.extract: Length header read: ${length}`);

                        // Sanity check length
                        if (length > 100 * 1024 * 1024) { // 100MB limit sanity
                            console.warn('Jsteg: Invalid length detected:', length);
                            return null;
                        }
                        data = new Uint8Array(length);
                        if (length === 0) return data;
                        state = 1;
                    }
                } else {
                    // Reading Data
                    if (byteIndex < length) {
                        data[byteIndex] = (data[byteIndex] << 1) | bit;
                        bitIndex++;
                        if (bitIndex === 8) {
                            bitIndex = 0;
                            byteIndex++;
                            if (byteIndex === length) {
                                // console.log(`Jsteg.extract: Successfully read ${length} bytes`);
                                return data;
                            }
                        }
                    }
                }
            }
        }

        // console.log(`Jsteg.extract: Ran out of blocks. Read ${byteIndex} bytes, ${bitIndex} bits. Total bits read: ${totalBitsRead}`);
        return null;
    }

    /**
     * Calculates the maximum capacity in bytes for the given blocks.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks 
     * @returns {number} Capacity in bytes
     */
    static calculateCapacity(blocks) {
        let capacityBits = 0;
        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                if (block[i] !== 0) capacityBits++;
            }
        }
        // Subtract 32 bits for header
        return Math.max(0, Math.floor((capacityBits - 32) / 8));
    }
    /**
     * Calculates CRC32 checksum.
     * 
     * @param {Uint8Array} data 
     * @returns {number} Unsigned 32-bit integer
     */
    static crc32(data) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                if ((crc & 1) !== 0) {
                    crc = (crc >>> 1) ^ 0xEDB88320;
                } else {
                    crc = crc >>> 1;
                }
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
}

class JstegReader {
    constructor(blocks) {
        this.blocks = blocks;
        this.blockIndex = 0;
        this.pixelIndex = 1; // Skip DC
        this.bitCount = 0; // Track total bits read
    }

    readBit() {
        while (this.blockIndex < this.blocks.length) {
            const block = this.blocks[this.blockIndex];
            while (this.pixelIndex < 64) {
                const val = block[this.pixelIndex];
                this.pixelIndex++;

                if (val === 0) continue;
                this.bitCount++;
                return val & 1;
            }
            this.pixelIndex = 1;
            this.blockIndex++;
        }
        return null; // EOF
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
