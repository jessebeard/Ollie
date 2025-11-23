/**
 * Optimized BitReader implementation
 * Avoids array slicing, uses lookahead
 */
export class BitReaderOptimized {
    constructor(data) {
        this.data = data;
        this.byteOffset = 0;
        this.bitOffset = 0; // 0-7, position within current byte
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

        const currentByte = this.data[this.byteOffset];
        const bit = (currentByte >> (7 - this.bitOffset)) & 1;

        this.bitOffset++;
        if (this.bitOffset === 8) {
            this.bitOffset = 0;
            this.byteOffset++;
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

        try {
            return this.readBits(length);
        } finally {
            this.byteOffset = savedByteOffset;
            this.bitOffset = savedBitOffset;
        }
    }

    /**
     * Efficiently peek at the next 16 bits
     * Optimized for Huffman decoding lookups
     */
    peek16Bits() {
        // Special case: if we're byte-aligned, we can do a super fast read
        if (this.bitOffset === 0 && this.byteOffset + 1 < this.data.length) {
            const b0 = this.data[this.byteOffset];
            const b1 = this.data[this.byteOffset + 1];

            // Check for 0xFF which might indicate stuffing or markers
            if (b0 !== 0xFF && b1 !== 0xFF) {
                return (b0 << 8) | b1;
            }
        }

        // Fast path: if we have enough bytes and no stuffing/markers in the next 3 bytes
        if (this.byteOffset + 2 < this.data.length) {
            const b0 = this.data[this.byteOffset];
            const b1 = this.data[this.byteOffset + 1];
            const b2 = this.data[this.byteOffset + 2];

            // Check for 0xFF which might indicate stuffing or markers
            if (b0 !== 0xFF && b1 !== 0xFF && b2 !== 0xFF) {
                // Combine bytes into a 24-bit integer
                // We want 16 bits starting from bitOffset
                const val = (b0 << 16) | (b1 << 8) | b2;
                return ((val << this.bitOffset) >> 8) & 0xFFFF;
            }
        }

        // Slow path: use existing peekBits or handle EOF
        try {
            return this.peekBits(16);
        } catch (e) {
            // If not enough bits, read what we can
            const remainingBytes = this.data.length - this.byteOffset;
            const remainingBits = (remainingBytes * 8) - this.bitOffset;

            if (remainingBits <= 0) return 0;

            const bitsToRead = Math.min(remainingBits, 16);
            try {
                const val = this.peekBits(bitsToRead);
                // Shift to align to MSB of 16-bit integer
                return (val << (16 - bitsToRead)) & 0xFFFF;
            } catch (e2) {
                return 0;
            }
        }
    }

    /**
     * Skip bits (advance pointer)
     * Uses readBit to ensure byte stuffing is handled correctly
     */
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
            throw new Error('Unexpected end of data');
        }

        let currentByte = this.data[this.byteOffset];

        // Check if we are at a stuffed 0x00 byte (preceded by 0xFF)
        // This handles the case where we just finished reading a 0xFF data byte
        if (currentByte === 0x00 && this.byteOffset > 0 && this.data[this.byteOffset - 1] === 0xFF) {
            this.byteOffset++;
            if (this.byteOffset >= this.data.length) {
                throw new Error('Unexpected end of data after stuffed byte');
            }
            currentByte = this.data[this.byteOffset];
        }

        // Now check for markers starting at current position
        if (currentByte === 0xFF && this.byteOffset + 1 < this.data.length) {
            const nextByte = this.data[this.byteOffset + 1];

            if (nextByte === 0x00) {
                // Byte stuffing: 0xFF 0x00 -> 0xFF
                // We don't need to do anything here. 
                // We will read the current 0xFF as data.
                // The next time _handleByteStuffing is called (for the next byte),
                // the first check above will skip the 0x00.
            } else if (nextByte >= 0xD0 && nextByte <= 0xD7) {
                // Restart marker (RSTm)
                // Skip both bytes and reset DC predictors (handled by caller)
                this.byteOffset += 2;
                this.bitOffset = 0;
                return 'RESTART';
            } else if (nextByte !== 0xFF) {
                // Other marker
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
