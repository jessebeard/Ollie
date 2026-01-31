import { describe, it, expect } from '../../utils/test-runner.js';
import { HuffmanTable } from '../../../src/core/decoder/huffman-parser.js';
import { BitReader } from '../../../src/utils/bit-reader.js';

describe('HuffmanTable (Naive)', () => {
    it('should decode using naive method', () => {
        
        HuffmanTable.setDecodeMethod('naive');

        const bits = new Uint8Array(16);
        bits[0] = 1;
        bits[1] = 1;
        bits[2] = 1;

        const values = new Uint8Array([0x05, 0x06, 0x07]);

        const table = new HuffmanTable(bits, values, 0, 0);

        const data = new Uint8Array([0x58]); 
        const reader = new BitReader(data);

        const s1 = table.decode(reader);
        expect(s1).toBe(0x05);

        const s2 = table.decode(reader);
        expect(s2).toBe(0x06);

        const s3 = table.decode(reader);
        expect(s3).toBe(0x07);

        HuffmanTable.setDecodeMethod('optimized');
    });
});
