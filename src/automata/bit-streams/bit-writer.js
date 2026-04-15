
export class BitWriter {
    constructor() {
        this.bytes = [];
        this.byte = 0;
        this.bitCount = 0;
    }

    writeBits(data, length) {
        // Optimization: Writing bits individually in a loop is highly inefficient.
        // Batching bitwise operations (masking and shifting multiple bits at once)
        // significantly reduces function call overhead and speeds up stream encoding operations.
        while (length > 0) {
            let space = 8 - this.bitCount;
            let toWrite = Math.min(length, space);
            let shift = length - toWrite;
            let bits = (data >>> shift) & ((1 << toWrite) - 1);

            this.byte = (this.byte << toWrite) | bits;
            this.bitCount += toWrite;
            length -= toWrite;

            if (this.bitCount === 8) {
                this.bytes.push(this.byte);
                // JPEG byte stuffing logic
                if (this.byte === 0xFF) {
                    this.bytes.push(0x00);
                }
                this.byte = 0;
                this.bitCount = 0;
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
