import { describe, it, expect } from '../utils/test-runner.js';
import { BitReader } from '../../src/utils/bit-reader.js';

describe('BitReader Switching', () => {
    it('should switch to naive mode and read bits', () => {
        BitReader.setMode('naive');

        const data = new Uint8Array([0xFF, 0x00, 0xAA]);
        const reader = new BitReader(data);

        const val1 = reader.readBits(8);
        expect(val1).toBe(0xFF);

        const val2 = reader.readBits(8);
        expect(val2).toBe(0xAA);

        expect(reader.impl.constructor.name).toBe('BitReaderNaive');
    });

    it('should switch to optimized mode and read bits', () => {
        BitReader.setMode('optimized');

        const data = new Uint8Array([0xFF, 0x00, 0xAA]);
        const reader = new BitReader(data);

        const val1 = reader.readBits(8);
        expect(val1).toBe(0xFF);

        const val2 = reader.readBits(8);
        expect(val2).toBe(0xAA);

        expect(reader.impl.constructor.name).toBe('BitReaderOptimized');
    });
});
