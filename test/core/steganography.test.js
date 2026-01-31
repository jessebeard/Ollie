import { describe, it, expect } from '../../test/utils/test-runner.js';
import { Jsteg } from '../../src/core/steganography/jsteg.js';

describe('Jsteg Steganography', async () => {
    await it('should calculate capacity correctly', () => {
        
        const blocks = [new Int32Array(64), new Int32Array(64)];

        for (let i = 1; i <= 10; i++) blocks[0][i] = 5;

        for (let i = 1; i <= 5; i++) blocks[1][i] = -3;

        expect(Jsteg.calculateCapacity(blocks)).toBe(0);

        const bigBlock = new Int32Array(64);
        for (let i = 1; i <= 40; i++) bigBlock[i] = 10;

        expect(Jsteg.calculateCapacity([bigBlock])).toBe(1);
    });

    await it('should embed and extract data correctly', () => {
        const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); 
        const bitsNeeded = (data.length + 4) * 8; 

        const blocks = [];
        let bitsCount = 0;
        while (bitsCount < bitsNeeded + 10) { 
            const block = new Int32Array(64);
            for (let i = 1; i < 64; i++) {
                block[i] = (i % 2 === 0) ? 2 : -2; 
            }
            blocks.push(block);
            bitsCount += 63;
        }

        const success = Jsteg.embed(blocks, data);
        expect(success).toBe(true);

        const extracted = Jsteg.extract(blocks);

        expect(extracted.length).toBe(data.length);
        for (let i = 0; i < data.length; i++) {
            expect(extracted[i]).toBe(data[i]);
        }
    });

    await it('should handle 1s and -1s correctly (expansion)', () => {
        const data = new Uint8Array([0xFF]); 

        const block = new Int32Array(64);

        for (let i = 1; i <= 40; i++) block[i] = 2;

        Jsteg.embed([block], data);

        for (let i = 1; i <= 40; i++) {
            if (block[i] === 0) {
                throw new Error(`Coefficient at ${i} became 0`);
            }
        }

        const extracted = Jsteg.extract([block]);
        expect(extracted.length).toBe(data.length);
        expect(extracted[0]).toBe(data[0]);
    });
});
