import * as core from './bit-core.js';

/**
 * Stateful wrapper for BitReader operations.
 * Delegates all logic to pure functional primitives in bit-core.js.
 */
export class BitReaderOptimized {
    constructor(data) {
        this.data = data;
        this.byteOffset = 0;
        this.bitOffset = 0;
    }

    readBit() {
        const [bit, newByte, newBit, err] = core.readBit(this.data, this.byteOffset, this.bitOffset);
        if (err) throw err;
        this.byteOffset = newByte;
        this.bitOffset = newBit;
        return bit;
    }

    readBits(length) {
        const [val, newByte, newBit, err] = core.readBits(this.data, this.byteOffset, this.bitOffset, length);
        if (err) throw err;
        this.byteOffset = newByte;
        this.bitOffset = newBit;
        return val;
    }

    peekBits(length) {
        const [val, , , err] = core.peekBits(this.data, this.byteOffset, this.bitOffset, length);
        if (err) throw err;
        return val;
    }

    peek16Bits() {
        const [val, , , err] = core.peek16Bits(this.data, this.byteOffset, this.bitOffset);
        if (err) throw err;
        return val;
    }

    skipBits(length) {
        this.readBits(length); // Pure function handles skipping efficiently enough for now
    }

    alignToByte() {
        if (this.bitOffset !== 0) {
            this.bitOffset = 0;
            this.byteOffset++;
        }

        // Only skip the stuffed 0x00 byte if the previous byte was 0xFF.
        // Do NOT use core.handleByteStuffing here as it may skip markers (like RST).
        if (this.byteOffset > 0 && 
            this.byteOffset < this.data.length && 
            this.data[this.byteOffset - 1] === 0xFF && 
            this.data[this.byteOffset] === 0x00) {
            this.byteOffset++;
        }
    }

    _handleByteStuffing() {
        const [marker, nextByteOffset, err] = core.handleByteStuffing(this.data, this.byteOffset);
        if (err) throw err;
        // In the original, this was an internal call. 
        // We expose it for compatibility if any tests rely on it directly.
        if (marker === 'RESTART') return marker;
        return null;
    }

    isEOF() {
        return this.byteOffset >= this.data.length;
    }

    getPosition() {
        return {
            byteOffset: this.byteOffset,
            bitOffset: this.bitOffset
        };
    }
}
