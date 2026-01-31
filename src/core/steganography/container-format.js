/**
 * Container Format for Steganographic Data Storage
 * 
 * Format:
 * [Magic Bytes: 4]     "JSTG" - format identifier
 * [Version: 1]         Format version (currently 1)
 * [Flags: 1]           Bit flags (encrypted, compressed, chunked, etc.)
 * [Metadata Length: 2] Length of JSON metadata in bytes
 * [Metadata: N]        JSON metadata (filename, encryption params, etc.)
 * [Payload Length: 4]  Actual data length
 * [Payload: N]         The data itself
 * [CRC32: 4]          Integrity checksum
 */

import { crc32 } from '../../utils/crc32.js';

const MAGIC_BYTES = new Uint8Array([0x4A, 0x53, 0x54, 0x47]);
const VERSION = 1;

const FLAGS = {
    ENCRYPTED: 1 << 0,
    COMPRESSED: 1 << 1,
    CHUNKED: 1 << 2,
    RESERVED_3: 1 << 3,
    RESERVED_4: 1 << 4,
    RESERVED_5: 1 << 5,
    RESERVED_6: 1 << 6,
    RESERVED_7: 1 << 7
};

export class ContainerFormat {
    /**
     * Encode data into container format
     * 
     * @param {Uint8Array} data - The payload data
     * @param {Object} metadata - Metadata object
     * @param {number} flags - Bit flags (use FLAGS constants)
     * @returns {Uint8Array} Encoded container
     */
    static encode(data, metadata = {}, flags = 0) {

        const metadataJson = JSON.stringify(metadata);
        const metadataBytes = new TextEncoder().encode(metadataJson);

        if (metadataBytes.length > 0xFFFF) {
            throw new Error(`Metadata too large: ${metadataBytes.length} bytes (max 65535)`);
        }

        const headerSize = 4 + 1 + 1 + 2;
        const totalSize = headerSize + metadataBytes.length + 4 + data.length + 4;

        const container = new Uint8Array(totalSize);
        let offset = 0;

        container.set(MAGIC_BYTES, offset);
        offset += 4;

        container[offset++] = VERSION;

        container[offset++] = flags;

        const metadataLength = metadataBytes.length;
        container[offset++] = (metadataLength >> 8) & 0xFF;
        container[offset++] = metadataLength & 0xFF;

        container.set(metadataBytes, offset);
        offset += metadataBytes.length;

        const payloadLength = data.length;
        container[offset++] = (payloadLength >> 24) & 0xFF;
        container[offset++] = (payloadLength >> 16) & 0xFF;
        container[offset++] = (payloadLength >> 8) & 0xFF;
        container[offset++] = payloadLength & 0xFF;

        container.set(data, offset);
        offset += data.length;

        const crcVal = crc32(container.subarray(0, offset));
        container[offset++] = (crcVal >> 24) & 0xFF;
        container[offset++] = (crcVal >> 16) & 0xFF;
        container[offset++] = (crcVal >> 8) & 0xFF;
        container[offset++] = crcVal & 0xFF;

        return container;
    }

    /**
     * Decode container format
     * 
     * @param {Uint8Array} container - Encoded container
     * @returns {Object} { data, metadata, flags, version }
     */
    static decode(container) {
        let offset = 0;

        if (container.length < 12) {
            throw new Error('Container too small');
        }

        const magic = container.subarray(0, 4);
        if (!this.arrayEquals(magic, MAGIC_BYTES)) {
            throw new Error('Invalid magic bytes (not a JSTG container)');
        }
        offset += 4;

        const version = container[offset++];
        if (version !== VERSION) {
            throw new Error(`Unsupported version: ${version} (expected ${VERSION})`);
        }

        const flags = container[offset++];

        const metadataLength = (container[offset] << 8) | container[offset + 1];
        offset += 2;

        if (container.length < offset + metadataLength + 4) {
            throw new Error('Container truncated (metadata section)');
        }

        const metadataBytes = container.subarray(offset, offset + metadataLength);
        offset += metadataLength;

        let metadata;
        try {
            const metadataJson = new TextDecoder().decode(metadataBytes);
            metadata = JSON.parse(metadataJson);
        } catch (e) {
            throw new Error(`Invalid metadata JSON: ${e.message}`);
        }

        const payloadLength = (
            (container[offset] << 24) |
            (container[offset + 1] << 16) |
            (container[offset + 2] << 8) |
            container[offset + 3]
        ) >>> 0;
        offset += 4;

        if (container.length < offset + payloadLength + 4) {
            throw new Error('Container truncated (payload section)');
        }

        const data = container.subarray(offset, offset + payloadLength);
        offset += payloadLength;

        const storedCrc = (
            (container[offset] << 24) |
            (container[offset + 1] << 16) |
            (container[offset + 2] << 8) |
            container[offset + 3]
        ) >>> 0;
        offset += 4;

        const calculatedCrc = crc32(container.subarray(0, offset - 4));

        if (storedCrc !== calculatedCrc) {
            throw new Error(`CRC mismatch (stored: 0x${storedCrc.toString(16)}, calculated: 0x${calculatedCrc.toString(16)})`);
        }

        return {
            data: new Uint8Array(data),
            metadata,
            flags,
            version
        };
    }

    /**
     * Compare two Uint8Arrays for equality
     */
    static arrayEquals(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Check if data appears to be a container (has magic bytes)
     */
    static isContainer(data) {
        if (data.length < 4) return false;
        return this.arrayEquals(data.subarray(0, 4), MAGIC_BYTES);
    }
}

export { FLAGS };
