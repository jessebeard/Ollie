import { describe, it, expect } from '../../test/utils/test-runner.js';
import { Jsteg } from '../../src/core/steganography/jsteg.js';

describe('Jsteg Steganography', async () => {
    await it('should calculate capacity correctly', () => {
        // Create 2 blocks with known non-zeros
        const blocks = [new Int32Array(64), new Int32Array(64)];

        // Block 0: 10 non-zeros (skipping DC)
        for (let i = 1; i <= 10; i++) blocks[0][i] = 5;

        // Block 1: 5 non-zeros
        for (let i = 1; i <= 5; i++) blocks[1][i] = -3;

        // Total non-zeros = 15 bits
        // Header = 32 bits. Capacity should be 0 (negative actually, clamped to 0)
        expect(Jsteg.calculateCapacity(blocks)).toBe(0);

        // Add enough non-zeros for 1 byte (8 bits) + 32 header = 40 bits
        const bigBlock = new Int32Array(64);
        for (let i = 1; i <= 40; i++) bigBlock[i] = 10;

        expect(Jsteg.calculateCapacity([bigBlock])).toBe(1);
    });

    await it('should embed and extract data correctly', () => {
        const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
        const bitsNeeded = (data.length + 4) * 8; // 5+4=9 bytes * 8 = 72 bits

        // Create blocks with enough capacity
        // We need 72 non-zero AC coefficients
        const blocks = [];
        let bitsCount = 0;
        while (bitsCount < bitsNeeded + 10) { // +10 buffer
            const block = new Int32Array(64);
            for (let i = 1; i < 64; i++) {
                block[i] = (i % 2 === 0) ? 2 : -2; // Use safe values > 1
            }
            blocks.push(block);
            bitsCount += 63;
        }

        const success = Jsteg.embed(blocks, data);
        expect(success).toBe(true);

        const extracted = Jsteg.extract(blocks);
        // expect(extracted).toEqual(data); // toEqual checks strict equality of objects/arrays in this runner?
        // Let's check manually if toEqual fails on typed arrays
        expect(extracted.length).toBe(data.length);
        for (let i = 0; i < data.length; i++) {
            expect(extracted[i]).toBe(data[i]);
        }
    });

    await it('should handle 1s and -1s correctly (expansion)', () => {
        const data = new Uint8Array([0xFF]); // 11111111
        // We need 8 bits + 32 header = 40 bits

        const block = new Int32Array(64);
        // Fill with 1s
        for (let i = 1; i <= 40; i++) block[i] = 1;

        // Embed
        Jsteg.embed([block], data);

        // Verify no 0s were created
        for (let i = 1; i <= 40; i++) {
            if (block[i] === 0) {
                throw new Error(`Coefficient at ${i} became 0`);
            }
        }

        // Extract
        const extracted = Jsteg.extract([block]);
        expect(extracted.length).toBe(data.length);
        expect(extracted[0]).toBe(data[0]);
    });
});
