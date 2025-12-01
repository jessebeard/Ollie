import { describe, it, expect } from './utils/test-runner.js';
import { Jsteg } from '../src/core/steganography/jsteg.js';

describe('Jsteg Format Detection', () => {
    function createMockBlocks(count, fillValue = 10) {
        const blocks = [];
        for (let i = 0; i < count; i++) {
            const block = new Int32Array(64).fill(fillValue);
            block[0] = 100; // DC
            blocks.push(block);
        }
        return blocks;
    }

    it('should extract legacy format with extract()', () => {
        const blocks = createMockBlocks(100);
        const data = new Uint8Array([1, 2, 3, 4, 5]);

        Jsteg.embed(blocks, data);
        const extracted = Jsteg.extract(blocks);

        expect(extracted).toBeDefined();
        expect(extracted.length).toBe(5);
        expect(extracted[0]).toBe(1);
    });

    it('should extract container format with extractContainer()', () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([10, 20, 30]);
        const metadata = { filename: 'test.bin' };

        Jsteg.embedContainer(blocks, data, metadata);
        const result = Jsteg.extractContainer(blocks);

        expect(result).toBeDefined();
        expect(result.data.length).toBe(3);
        expect(result.metadata.filename).toBe('test.bin');
    });

    it('should NOT extract container format with legacy extract()', () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([10, 20, 30]);
        const metadata = { filename: 'test.bin' };

        Jsteg.embedContainer(blocks, data, metadata);

        // Try to extract with legacy method
        const extracted = Jsteg.extract(blocks);

        // This will fail because extract() expects [Length][Data] but gets [JSTG][Version]...
        // The length will be interpreted as 0x4A535447 (JSTG in hex) which is huge
        expect(extracted).toBe(null);
    });
});
