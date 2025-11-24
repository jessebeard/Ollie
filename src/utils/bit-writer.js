
export class BitWriter {
    constructor() {
        this.bytes = [];
        this.byte = 0;
        this.bitCount = 0;
    }

    writeBits(data, length) {
        for (let i = length - 1; i >= 0; i--) {
            const bit = (data >> i) & 1;
            this.writeBit(bit);
        }
    }

    writeBit(bit) {
        this.byte = (this.byte << 1) | bit;
        this.bitCount++;
        if (this.bitCount === 8) {
            this.bytes.push(this.byte);
            // Byte stuffing: if byte is 0xFF, write 0x00
            if (this.byte === 0xFF) {
                this.bytes.push(0x00);
            }
            this.byte = 0;
            this.bitCount = 0;
        }
    }

    alignByte() {
        if (this.bitCount > 0) {
            // Pad with 1s to the next byte boundary
            const shift = 8 - this.bitCount;
            this.byte = (this.byte << shift) | ((1 << shift) - 1);
            this.bytes.push(this.byte);
            if (this.byte === 0xFF) {
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
        this.alignByte();
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
