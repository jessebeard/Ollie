import { BitReaderOptimized } from './bit-reader-optimized.js';

/**
 * BitReader Wrapper
 * Delegates to the Optimized implementation
 */
export class BitReader {
    constructor(data) {
        this.impl = new BitReaderOptimized(data);
    }

    readBit() { return this.impl.readBit(); }
    readBits(length) { return this.impl.readBits(length); }
    peekBits(length) { return this.impl.peekBits(length); }
    peek16Bits() { return this.impl.peek16Bits(); }
    skipBits(length) { return this.impl.skipBits(length); }
    alignToByte() { return this.impl.alignToByte(); }
    isEOF() { return this.impl.isEOF(); }
    getPosition() { return this.impl.getPosition(); }

    _handleByteStuffing() { return this.impl._handleByteStuffing(); }

    get byteOffset() { return this.impl.byteOffset; }
    set byteOffset(v) { this.impl.byteOffset = v; }

    get bitOffset() { return this.impl.bitOffset; }
    set bitOffset(v) { this.impl.bitOffset = v; }

    get data() { return this.impl.data; }
    set data(v) { this.impl.data = v; }
}
