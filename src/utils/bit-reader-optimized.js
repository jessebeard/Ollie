/**
 * Optimized BitReader implementation
 * Avoids array slicing, uses lookahead
 */
export class BitReaderOptimized {
    constructor(data) {
        this.data = data;
        this.byteOffset = 0;
        this.bitOffset = 0;
    }

    /**
     * Read a single bit (0 or 1)
     */
    readBit() {
        // Handle EOF gracefully by returning 0 (padding)
        if (this.byteOffset >= this.data.length && this.bitOffset === 0) {
            return 0;
        }

        if (this.bitOffset === 0) {
            this._handleByteStuffing();
        }

        // Check again after byte stuffing logic (pointers might have moved)
        if (this.byteOffset >= this.data.length) {
            return 0;
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

        if (this.bitOffset === 0 && this.byteOffset + 1 < this.data.length) {
            const b0 = this.data[this.byteOffset];
            const b1 = this.data[this.byteOffset + 1];

            if (b0 !== 0xFF && b1 !== 0xFF) {
                return (b0 << 8) | b1;
            }
        }

        if (this.byteOffset + 2 < this.data.length) {
            const b0 = this.data[this.byteOffset];
            const b1 = this.data[this.byteOffset + 1];
            const b2 = this.data[this.byteOffset + 2];

            if (b0 !== 0xFF && b1 !== 0xFF && b2 !== 0xFF) {

                const val = (b0 << 16) | (b1 << 8) | b2;
                return ((val << this.bitOffset) >> 8) & 0xFFFF;
            }
        }

        try {
            return this.peekBits(16);
        } catch (e) {

            const remainingBytes = this.data.length - this.byteOffset;
            const remainingBits = (remainingBytes * 8) - this.bitOffset;

            if (remainingBits <= 0) return 0;

            const bitsToRead = Math.min(remainingBits, 16);
            try {
                const val = this.peekBits(bitsToRead);

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
            return; // Allow EOF, readBit will handle it
        }

        let currentByte = this.data[this.byteOffset];

        if (currentByte === 0x00 && this.byteOffset > 0 && this.data[this.byteOffset - 1] === 0xFF) {
            this.byteOffset++;
            // If checking for stuffed byte pushes us to EOF, that's fine
            if (this.byteOffset >= this.data.length) {
                return;
            }
            currentByte = this.data[this.byteOffset];
        }

        // ... rest of logic ...

        if (currentByte === 0xFF && this.byteOffset + 1 < this.data.length) {
            const nextByte = this.data[this.byteOffset + 1];

            if (nextByte === 0x00) {
                // Stuffed byte, handled by usual flow (next readBit call will skip 00)
            } else if (nextByte >= 0xD0 && nextByte <= 0xD7) {
                // Do NOT consume RST markers automatically. 
                // Let the decoder handle them at expected intervals.
                // We treat this 0xFF as a normal byte for now? 
                // Actually, finding a marker during normal read is an edge case. 
                // But for explicit marker reading in decodeScan, we need it to NOT be skipped.
                return 'RESTART';
            } else if (nextByte !== 0xFF) {
                console.warn(`Unexpected marker: 0xFF${nextByte.toString(16).padStart(2, '0').toUpperCase()} at ${this.byteOffset}`);
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
