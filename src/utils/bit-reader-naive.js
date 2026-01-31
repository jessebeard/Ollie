/**
 * Naive BitReader implementation (original from git)
 * Uses array slicing for byte stuffing (slow but reference implementation)
 */
export class BitReaderNaive {
    constructor(data) {
        this.data = data;
        this.byteOffset = 0;
        this.bitOffset = 0; 
        this.destuffedPositions = new Set(); 
        this.isPeeking = false; 
    }

    /**
     * Read a single bit (0 or 1)
     */
    readBit() {
        
        if (this.bitOffset === 0) {
            
            this._handleByteStuffing();
        }

        if (this.isPeeking && this.byteOffset >= this.data.length) {
            return 0;
        }

        const currentByte = this.data[this.byteOffset];
        const bit = (currentByte >> (7 - this.bitOffset)) & 1;

        this.bitOffset++;
        if (this.bitOffset === 8) {
            this.bitOffset = 0;
            this.byteOffset++;

            if (currentByte === 0xFF && this.byteOffset < this.data.length && this.data[this.byteOffset] === 0x00) {
                if (this.isPeeking) {
                    
                    this.byteOffset++;
                }
                
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

        this.isPeeking = true;
        const value = this.readBits(length);
        this.isPeeking = false;

        this.byteOffset = savedByteOffset;
        this.bitOffset = savedBitOffset;

        return value;
    }

    peek16Bits() {
        return this.peekBits(16);
    }

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

            if (this.isPeeking) {
                return null;
            }
            throw new Error('Unexpected end of data');
        }

        const currentByte = this.data[this.byteOffset];

        if (currentByte === 0xFF && this.byteOffset + 1 < this.data.length) {
            const nextByte = this.data[this.byteOffset + 1];

            if (nextByte === 0x00) {
                
                if (!this.isPeeking && !this.destuffedPositions.has(this.byteOffset)) {
                    
                    this.data = new Uint8Array([
                        ...this.data.slice(0, this.byteOffset + 1),
                        ...this.data.slice(this.byteOffset + 2)
                    ]);
                    
                    this.destuffedPositions.add(this.byteOffset);
                }
                
            } else if (nextByte >= 0xD0 && nextByte <= 0xD7) {

                this.byteOffset += 2;
                this.bitOffset = 0;
                return 'RESTART';
            } else if (nextByte !== 0xFF) {
                
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
