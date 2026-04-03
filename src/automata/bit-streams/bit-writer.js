
export class BitWriter {
    constructor() {
        this.bytes = [];
        this.byte = 0;
        this.bitCount = 0;
    }

    _pushByte() {
        this.bytes.push(this.byte);
        if (this.byte === 0xFF) {
            this.bytes.push(0x00);
        }
        this.byte = 0;
        this.bitCount = 0;
    }

    writeBits(data, length) {
        // Fast path: batch bitwise operations to reduce function call overhead
        while (length > 0) {
            const bitsToNextByte = 8 - this.bitCount;
            const bitsToWrite = length > bitsToNextByte ? bitsToNextByte : length;

            const shift = length - bitsToWrite;
            const extracted = (data >> shift) & ((1 << bitsToWrite) - 1);

            this.byte = (this.byte << bitsToWrite) | extracted;
            this.bitCount += bitsToWrite;

            if (this.bitCount === 8) {
                this._pushByte();
            }

            length -= bitsToWrite;
        }
    }

    writeBit(bit) {
        this.byte = (this.byte << 1) | bit;
        this.bitCount++;
        if (this.bitCount === 8) {
            this._pushByte();
        }
    }

    alignByte(disableStuffing = false) {
        if (this.bitCount > 0) {

            const shift = 8 - this.bitCount;
            this.byte = (this.byte << shift) | ((1 << shift) - 1);
            this.bytes.push(this.byte);
            if (this.byte === 0xFF && !disableStuffing) {
                this.bytes.push(0x00);
            }
            this.byte = 0;
            this.bitCount = 0;
        }
    }

    /**
     * Writes a 2-byte marker (e.g. 0xFFDA) ensuring alignment and NO byte stuffing.
     */
    writeMarker(marker) {
        this.alignByte(true);
        this.bytes.push((marker >> 8) & 0xFF);
        this.bytes.push(marker & 0xFF);
    }

    /**
     * Writes a raw byte ensuring alignment and NO byte stuffing.
     */
    writeRawByte(b) {
        this.alignByte();
        this.bytes.push(b & 0xFF);
    }

    flush() {
        this.alignByte();
        return new Uint8Array(this.bytes);
    }
}
