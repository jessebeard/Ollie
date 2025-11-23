/**
 * Naive BitReader implementation (original from git)
 * Uses array slicing for byte stuffing (slow but reference implementation)
 */
export class BitReaderNaive {
    constructor(data) {
        this.data = data;
        this.byteOffset = 0;
        this.bitOffset = 0; // 0-7, position within current byte
        this.destuffedPositions = new Set(); // Track positions where we've removed stuffed bytes
        this.isPeeking = false; // Flag to prevent array modification during peek
    }

    /**
     * Read a single bit (0 or 1)
     */
    readBit() {
        // Check if we need to move to next byte
        if (this.bitOffset === 0) {
            // Check for byte stuffing and markers
            this._handleByteStuffing();
        }

        // During peek, if we've gone past end of data, return 0
        if (this.isPeeking && this.byteOffset >= this.data.length) {
            return 0;
        }

        const currentByte = this.data[this.byteOffset];
        const bit = (currentByte >> (7 - this.bitOffset)) & 1;

        this.bitOffset++;
        if (this.bitOffset === 8) {
            this.bitOffset = 0;
            this.byteOffset++;

            // CRITICAL: If we just finished reading an 0xFF and next byte is 0x00 (stuffed byte)
            // Skip the 0x00 during peek, or it's already removed during actual read
            if (currentByte === 0xFF && this.byteOffset < this.data.length && this.data[this.byteOffset] === 0x00) {
                if (this.isPeeking) {
                    // During peek: skip over the stuffed 0x00
                    this.byteOffset++;
                }
                // During actual read: 0x00 was already removed by _handleByteStuffing, so nothing to do
            }
        }

        return bit;
    }

    /**
     * Read multiple bits (1-16) as an integer
     */
    readBits(length) {
        if (length < 1 || length > 16) {
            throw new Error(`Invalid bit length: ${length}. Must be 1-16.`);
        }

        let value = 0;
        for (let i = 0; i < length; i++) {
            value = (value << 1) | this.readBit();
        }
        return value;
    }

    /**
     * Peek at bits without consuming them
     */
    peekBits(length) {
        const savedByteOffset = this.byteOffset;
        const savedBitOffset = this.bitOffset;

        // Set peeking flag to prevent array modification
        this.isPeeking = true;
        const value = this.readBits(length);
        this.isPeeking = false;

        // Restore position
        this.byteOffset = savedByteOffset;
        this.bitOffset = savedBitOffset;

        return value;
    }

    // Added for compatibility with optimized decoder
    peek16Bits() {
        return this.peekBits(16);
    }

    // Added for compatibility with optimized decoder
    skipBits(length) {
        for (let i = 0; i < length; i++) {
            this.readBit();
        }
    }

    /**
     * Skip to next byte boundary
     */
    alignToByte() {
        if (this.bitOffset !== 0) {
            this.bitOffset = 0;
            this.byteOffset++;
        }
    }

    /**
     * Handle byte stuffing and marker detection
     * Called when moving to a new byte during bit reading
     */
    _handleByteStuffing() {
        if (this.byteOffset >= this.data.length) {
            // During peek operations, we might read past end temporarily
            // This is OK because position will be restored
            if (this.isPeeking) {
                return null;
            }
            throw new Error('Unexpected end of data');
        }

        const currentByte = this.data[this.byteOffset];

        // Only check for markers/stuffing if current byte is 0xFF
        // and we have a next byte to check
        if (currentByte === 0xFF && this.byteOffset + 1 < this.data.length) {
            const nextByte = this.data[this.byteOffset + 1];

            if (nextByte === 0x00) {
                // Byte stuffing: 0xFF 0x00 -> 0xFF (per JPEG T.81 spec)
                if (!this.isPeeking && !this.destuffedPositions.has(this.byteOffset)) {
                    // Only modify array during actual reads, not during peek
                    this.data = new Uint8Array([
                        ...this.data.slice(0, this.byteOffset + 1),
                        ...this.data.slice(this.byteOffset + 2)
                    ]);
                    // Mark this position as destuffed
                    this.destuffedPositions.add(this.byteOffset);
                }
                // Continue reading from current 0xFF byte as data
            } else if (nextByte >= 0xD0 && nextByte <= 0xD7) {
                // Restart marker (RSTm)
                // Skip both bytes and reset DC predictors (handled by caller)
                this.byteOffset += 2;
                this.bitOffset = 0;
                return 'RESTART';
            } else if (nextByte !== 0xFF) {
                // Other marker - this might be end of scan data
                throw new Error(`Unexpected marker: 0xFF${nextByte.toString(16).padStart(2, '0').toUpperCase()}`);
            }
        }

        return null;
    }

    /**
     * Check if we've reached the end of data
     */
    isEOF() {
        return this.byteOffset >= this.data.length;
    }

    /**
     * Get current position (for debugging)
     */
    getPosition() {
        return {
            byteOffset: this.byteOffset,
            bitOffset: this.bitOffset
        };
    }
}
