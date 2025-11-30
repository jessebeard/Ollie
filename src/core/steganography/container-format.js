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

const MAGIC_BYTES = new Uint8Array([0x4A, 0x53, 0x54, 0x47]); // "JSTG"
const VERSION = 1;

// Flag bits
const FLAGS = {
    ENCRYPTED: 1 << 0,   // 0x01
    COMPRESSED: 1 << 1,  // 0x02
    CHUNKED: 1 << 2,     // 0x04
    RESERVED_3: 1 << 3,  // 0x08
    RESERVED_4: 1 << 4,  // 0x10
    RESERVED_5: 1 << 5,  // 0x20
    RESERVED_6: 1 << 6,  // 0x40
    RESERVED_7: 1 << 7   // 0x80
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
        // Serialize metadata to JSON
        const metadataJson = JSON.stringify(metadata);
        const metadataBytes = new TextEncoder().encode(metadataJson);

        if (metadataBytes.length > 0xFFFF) {
            throw new Error(`Metadata too large: ${metadataBytes.length} bytes (max 65535)`);
        }

        // Calculate total size
        const headerSize = 4 + 1 + 1 + 2; // magic + version + flags + metadata length
        const totalSize = headerSize + metadataBytes.length + 4 + data.length + 4;

        const container = new Uint8Array(totalSize);
        let offset = 0;

        // Write magic bytes
        container.set(MAGIC_BYTES, offset);
        offset += 4;

        // Write version
        container[offset++] = VERSION;

        // Write flags
        container[offset++] = flags;

        // Write metadata length (16-bit big endian)
        const metadataLength = metadataBytes.length;
        container[offset++] = (metadataLength >> 8) & 0xFF;
        container[offset++] = metadataLength & 0xFF;

        // Write metadata
        container.set(metadataBytes, offset);
        offset += metadataBytes.length;

        // Write payload length (32-bit big endian)
        const payloadLength = data.length;
        container[offset++] = (payloadLength >> 24) & 0xFF;
        container[offset++] = (payloadLength >> 16) & 0xFF;
        container[offset++] = (payloadLength >> 8) & 0xFF;
        container[offset++] = payloadLength & 0xFF;

        // Write payload
        container.set(data, offset);
        offset += data.length;

        // Calculate and write CRC32
        const crc = this.crc32(container.subarray(0, offset));
        container[offset++] = (crc >> 24) & 0xFF;
        container[offset++] = (crc >> 16) & 0xFF;
        container[offset++] = (crc >> 8) & 0xFF;
        container[offset++] = crc & 0xFF;

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

        // Check minimum size
        if (container.length < 12) {
            throw new Error('Container too small');
        }

        // Verify magic bytes
        const magic = container.subarray(0, 4);
        if (!this.arrayEquals(magic, MAGIC_BYTES)) {
            throw new Error('Invalid magic bytes (not a JSTG container)');
        }
        offset += 4;

        // Read version
        const version = container[offset++];
        if (version !== VERSION) {
            throw new Error(`Unsupported version: ${version} (expected ${VERSION})`);
        }

        // Read flags
        const flags = container[offset++];

        // Read metadata length
        const metadataLength = (container[offset] << 8) | container[offset + 1];
        offset += 2;

        // Verify we have enough data
        if (container.length < offset + metadataLength + 4) {
            throw new Error('Container truncated (metadata section)');
        }

        // Read and parse metadata
        const metadataBytes = container.subarray(offset, offset + metadataLength);
        offset += metadataLength;

        let metadata;
        try {
            const metadataJson = new TextDecoder().decode(metadataBytes);
            metadata = JSON.parse(metadataJson);
        } catch (e) {
            throw new Error(`Invalid metadata JSON: ${e.message}`);
        }

        // Read payload length
        const payloadLength = (
            (container[offset] << 24) |
            (container[offset + 1] << 16) |
            (container[offset + 2] << 8) |
            container[offset + 3]
        ) >>> 0; // Unsigned
        offset += 4;

        // Verify we have enough data
        if (container.length < offset + payloadLength + 4) {
            throw new Error('Container truncated (payload section)');
        }

        // Read payload
        const data = container.subarray(offset, offset + payloadLength);
        offset += payloadLength;

        // Read and verify CRC32
        const storedCrc = (
            (container[offset] << 24) |
            (container[offset + 1] << 16) |
            (container[offset + 2] << 8) |
            container[offset + 3]
        ) >>> 0; // Unsigned
        offset += 4;

        const calculatedCrc = this.crc32(container.subarray(0, offset - 4));

        if (storedCrc !== calculatedCrc) {
            throw new Error(`CRC mismatch (stored: 0x${storedCrc.toString(16)}, calculated: 0x${calculatedCrc.toString(16)})`);
        }

        return {
            data: new Uint8Array(data), // Copy to avoid subarray references
            metadata,
            flags,
            version
        };
    }

    /**
     * Calculate CRC32 checksum
     * 
     * @param {Uint8Array} data 
     * @returns {number} CRC32 value
     */
    static crc32(data) {
        // Generate CRC table (lazy initialization)
        if (!this._crcTable) {
            this._crcTable = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let crc = i;
                for (let j = 0; j < 8; j++) {
                    crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
                }
                this._crcTable[i] = crc >>> 0;
            }
        }

        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            const byte = data[i];
            const index = (crc ^ byte) & 0xFF;
            crc = (this._crcTable[index] ^ (crc >>> 8)) >>> 0;
        }

        return (crc ^ 0xFFFFFFFF) >>> 0;
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
