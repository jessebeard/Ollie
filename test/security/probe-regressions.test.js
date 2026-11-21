import { describe, it, expect } from '../utils/test-runner.js';
import { StegoEngine } from '../../src/information-theory/steganography/stego-engine.js';

function createMockBlocks(count) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const block = new Int32Array(64);
        block[0] = 100;
        for (let c = 1; c < 64; c++) {
            block[c] = (c % 2 === 0) ? 7 : -7;
        }
        blocks.push(block);
    }
    return blocks;
}

describe('Format v4 Probe Regressions & False Extraction Rejection', () => {
    it('clean carriers without stego produce zero accidental extractions', async () => {
        for (const count of [20, 80, 200]) {
            const blocks = createMockBlocks(count);
            const [extracted, err] = await StegoEngine.extract(blocks, 'any-password', {
                kdfOpts: { memorySize: 64, passes: 1 }
            });
            expect(extracted).toBe(null);
            expect(err instanceof Error).toBe(true);
        }
    });
});
