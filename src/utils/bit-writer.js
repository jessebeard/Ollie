
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

    flush() {
        if (this.bitCount > 0) {
            this.byte = this.byte << (8 - this.bitCount);
            this.bytes.push(this.byte);
            if (this.byte === 0xFF) {
                this.bytes.push(0x00);
            }
            this.bitCount = 0;
            this.byte = 0;
        }
        return new Uint8Array(this.bytes);
    }
}
