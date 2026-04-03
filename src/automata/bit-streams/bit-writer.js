
export class BitWriter {
    constructor() {
        this.bytes = [];
        this.byte = 0;
        this.bitCount = 0;
    }

    writeBits(data, length) {
        // Fast path: batch bitwise operations to eliminate function call overhead.
        // It writes chunks of bits to fill bytes efficiently.
        while (length > 0) {
            const space = 8 - this.bitCount;
            if (length >= space) {
                length -= space;
                const bits = (data >> length) & ((1 << space) - 1);
                this.byte = (this.byte << space) | bits;

                this.bytes.push(this.byte);
                if (this.byte === 0xFF) {
                    this.bytes.push(0x00);
                }

                this.byte = 0;
                this.bitCount = 0;
            } else {
                const bits = data & ((1 << length) - 1);
                this.byte = (this.byte << length) | bits;
                this.bitCount += length;
                length = 0;
            }
        }
    }

    writeBit(bit) {
        this.byte = (this.byte << 1) | bit;
        this.bitCount++;
        if (this.bitCount === 8) {
            this.bytes.push(this.byte);

            if (this.byte === 0xFF) {
                this.bytes.push(0x00);
            }
            this.byte = 0;
            this.bitCount = 0;
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
