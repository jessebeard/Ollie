import { describe, it, expect } from '../utils/test-runner.js';
import { BitReader } from '../../src/utils/bit-reader.js';

describe('BitReader Switching', () => {
    it('should switch to naive mode and read bits', () => {
        BitReader.setMode('naive');

        // 0xFF 0x00 -> 0xFF (stuffing)
        // 0xFF 0x00 0xAA -> 0xFF 0xAA
        const data = new Uint8Array([0xFF, 0x00, 0xAA]);
        const reader = new BitReader(data);

        // Read 8 bits: should be 0xFF
        const val1 = reader.readBits(8);
        expect(val1).toBe(0xFF);

        // Read 8 bits: should be 0xAA (skipping 0x00)
        const val2 = reader.readBits(8);
        expect(val2).toBe(0xAA);

        // Verify implementation details (naive uses array slicing, so data length changes?)
        // Actually, naive implementation replaces 'this.data'.
        // Let's check if we can detect which impl is used.
        // Naive impl has 'BitReaderNaive' constructor name?
        expect(reader.impl.constructor.name).toBe('BitReaderNaive');
    });

    it('should switch to optimized mode and read bits', () => {
        BitReader.setMode('optimized');

        const data = new Uint8Array([0xFF, 0x00, 0xAA]);
        const reader = new BitReader(data);

        // Read 8 bits: should be 0xFF
        const val1 = reader.readBits(8);
        expect(val1).toBe(0xFF);

        // Read 8 bits: should be 0xAA (skipping 0x00)
        const val2 = reader.readBits(8);
        expect(val2).toBe(0xAA);

        expect(reader.impl.constructor.name).toBe('BitReaderOptimized');
    });
});
