import { describe, it, expect } from './utils/test-runner.js';
import { Jsteg } from '../src/core/steganography/jsteg.js';

describe('Jsteg Legacy Roundtrip', () => {
    function createMockBlocks(count, fillValue = 10) {
        const blocks = [];
        for (let i = 0; i < count; i++) {
            const block = new Int32Array(64).fill(fillValue);
            block[0] = 100; // DC
            blocks.push(block);
        }
        return blocks;
    }

    it('should work with legacy embed and extract', () => {
        const blocks = createMockBlocks(100);
        const data = new Uint8Array([10, 20, 30, 40, 50]);

        // Embed using legacy method
        const success = Jsteg.embed(blocks, data);
        expect(success).toBe(true);

        // Extract using legacy method
        const extracted = Jsteg.extract(blocks);

        expect(extracted).toBeDefined();
        expect(extracted.length).toBe(data.length);
        expect(extracted[0]).toBe(10);
        expect(extracted[4]).toBe(50);
    });

    it('should handle blocks with 1s and -1s', () => {
        // Create blocks with 1s
        const blocks = [];
        for (let i = 0; i < 100; i++) {
            const block = new Int32Array(64).fill(1);
            block[0] = 100; // DC
            blocks.push(block);
        }

        const data = new Uint8Array([0xAA, 0x55]); // 10101010, 01010101

        Jsteg.embed(blocks, data);
        const extracted = Jsteg.extract(blocks);

        expect(extracted).toBeDefined();
        expect(extracted.length).toBe(2);
        expect(extracted[0]).toBe(0xAA);
        expect(extracted[1]).toBe(0x55);
    });

    it('should handle blocks with mixed values', () => {
        const blocks = [];
        for (let i = 0; i < 100; i++) {
            const block = new Int32Array(64);
            for (let j = 0; j < 64; j++) block[j] = (j % 5) - 2; // -2, -1, 0, 1, 2
            block[0] = 100;
            blocks.push(block);
        }

        const data = new Uint8Array([1, 2, 3]);
        Jsteg.embed(blocks, data);
        const extracted = Jsteg.extract(blocks);

        expect(extracted).toBeDefined();
        expect(extracted.length).toBe(3);
        expect(extracted[0]).toBe(1);
    });
});
