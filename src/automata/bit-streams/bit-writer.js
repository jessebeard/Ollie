
export class BitWriter {
    constructor() {
        this.bytes = [];
        this.byte = 0;
        this.bitCount = 0;
    }

    writeBits(data, length) {
        let bitCount = this.bitCount;
        let byte = this.byte;
        const bytes = this.bytes;

        // Bolt: Batch process bits by filling the byte using bitwise shifts instead of writing bits one-by-one
        // with individual writeBit calls. This removes significant function call overhead and redundant checks.
        while (length > 0) {
            const freeBits = 8 - bitCount;
            if (length >= freeBits) {
                // Fill the current byte completely
                const shift = length - freeBits;
                byte = (byte << freeBits) | ((data >>> shift) & ((1 << freeBits) - 1));
                bytes.push(byte);

                // JPEG byte stuffing logic
                if (byte === 0xFF) {
                    bytes.push(0x00);
                }

                byte = 0;
                bitCount = 0;
                length -= freeBits;
            } else {
                // Partially fill the current byte
                byte = (byte << length) | (data & ((1 << length) - 1));
                bitCount += length;
                length = 0;
            }
        }

        this.bitCount = bitCount;
        this.byte = byte;
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
