
export class BitWriter {
    constructor() {
        this.bytes = [];
        this.byte = 0;
        this.bitCount = 0;
    }

writeBits(data, length) {
        let remaining = length;
        while (remaining > 0) {
            const space = 8 - this.bitCount;
            if (remaining <= space) {
                // Fits entirely in current byte
                this.byte = (this.byte << remaining) | (data & ((1 << remaining) - 1));
                this.bitCount += remaining;
                remaining = 0;
            } else {
                // Fill up the current byte
                const take = space;
                remaining -= take;
                this.byte = (this.byte << take) | ((data >> remaining) & ((1 << take) - 1));
                this.bitCount += take;
            }

            if (this.bitCount === 8) {
                this.bytes.push(this.byte);
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
