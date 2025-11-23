import { describe, it, expect } from '../../utils/test-runner.js';
import { HuffmanTable } from '../../../src/core/decoder/huffman-parser.js';
import { BitReader } from '../../../src/utils/bit-reader.js';

describe('HuffmanTable (Naive)', () => {
    it('should decode using naive method', () => {
        // Switch to naive method
        HuffmanTable.setDecodeMethod('naive');

        // Example from JPEG spec K.3.3.1
        // Code length  Code word  Symbol
        // 1            0          0x05
        // 2            10         0x06
        // 3            110        0x07

        // BITS: [1, 1, 1, 0, ... 0]
        const bits = new Uint8Array(16);
        bits[0] = 1;
        bits[1] = 1;
        bits[2] = 1;

        // HUFFVAL: [0x05, 0x06, 0x07]
        const values = new Uint8Array([0x05, 0x06, 0x07]);

        const table = new HuffmanTable(bits, values, 0, 0);

        // Test data: 0 (1 bit) -> 0x05
        //            10 (2 bits) -> 0x06
        //            110 (3 bits) -> 0x07
        // Stream: 0 10 110 ...
        // Binary: 0101 10xx -> 0x58 (approx)

        const data = new Uint8Array([0x58]); // 0101 1000
        const reader = new BitReader(data);

        const s1 = table.decode(reader);
        expect(s1).toBe(0x05);

        const s2 = table.decode(reader);
        expect(s2).toBe(0x06);

        const s3 = table.decode(reader);
        expect(s3).toBe(0x07);

        // Restore default
        HuffmanTable.setDecodeMethod('optimized');
    });
});
