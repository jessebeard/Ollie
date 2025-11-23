import { BitReaderNaive } from './bit-reader-naive.js';
import { BitReaderOptimized } from './bit-reader-optimized.js';

/**
 * BitReader Wrapper
 * Delegates to either Naive or Optimized implementation
 */
export class BitReader {
    constructor(data) {
        if (BitReader.mode === 'naive') {
            this.impl = new BitReaderNaive(data);
        } else {
            this.impl = new BitReaderOptimized(data);
        }
    }

    static setMode(mode) {
        BitReader.mode = mode;
    }

    readBit() { return this.impl.readBit(); }
    readBits(length) { return this.impl.readBits(length); }
    peekBits(length) { return this.impl.peekBits(length); }
    peek16Bits() { return this.impl.peek16Bits(); }
    skipBits(length) { return this.impl.skipBits(length); }
    alignToByte() { return this.impl.alignToByte(); }
    isEOF() { return this.impl.isEOF(); }
    getPosition() { return this.impl.getPosition(); }

    // _handleByteStuffing is internal, but if called externally (tests?), proxy it
    _handleByteStuffing() { return this.impl._handleByteStuffing(); }

    // Getters/Setters for properties if accessed directly
    get byteOffset() { return this.impl.byteOffset; }
    set byteOffset(v) { this.impl.byteOffset = v; }

    get bitOffset() { return this.impl.bitOffset; }
    set bitOffset(v) { this.impl.bitOffset = v; }

    get data() { return this.impl.data; }
    set data(v) { this.impl.data = v; }
}

// Default mode
BitReader.mode = 'optimized';
