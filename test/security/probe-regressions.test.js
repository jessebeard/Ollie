import { describe, it, expect } from '../utils/test-runner.js';
import { F5 } from '../../src/information-theory/steganography/f5-syndrome.js';
import { buildV3Container } from '../utils/container-builder.mjs';

const MAGIC = 'F5SG';

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


describe('Probe regressions (promoted from root evidence scripts)', () => {

    it('forged 128MB payloadLen is rejected before any long coefficient walk', async () => {
        const blocks = createMockBlocks(90);
        const forged = buildV3Container({ metadataObj: {}, override: { payloadLen: 134217728, originalLength: 134217728 } });
        const result = F5.embedRaw(blocks, forged, { seed: 'len-attack', k: 1 });
        expect(result.success).toBe(true); // forged control still embeds (it is just bits)

        const started = Date.now();
        const extracted = await F5.extractAuto(blocks, { seed: 'len-attack' });
        const elapsed = Date.now() - started;

        expect(extracted).toEqual(null);
        expect(elapsed < 5000).toBe(true);
    });

    it('clean passwordless carriers produce zero accidental extractions', async () => {
        for (const count of [20, 80, 200]) {
            const blocks = createMockBlocks(count);
            const extracted = await F5.extractAuto(blocks, {});
            if (extracted !== null) {
                expect(extracted).toEqual(null);
            }
        }
        expect(true).toBe(true);
    });
});
