import { describe, it, expect } from '../utils/test-runner.js';
import { F5 } from '../../src/information-theory/steganography/f5-syndrome.js';
import { crc32 } from '../../src/utils/crc32.js';

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

function buildContainerBytes(metadataObj) {
    const metaBytes = new TextEncoder().encode(JSON.stringify(metadataObj || {}));
    const totalSize = 4 + 1 + 1 + 1 + 2 + metaBytes.length + 4 + 0 + 4;
    const buf = new Uint8Array(totalSize);
    const view = new DataView(buf.buffer);
    let offset = 0;

    buf.set(new TextEncoder().encode(MAGIC), offset); offset += 4;
    view.setUint8(offset, 2); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 1); offset += 1;
    view.setUint16(offset, metaBytes.length, false); offset += 2;
    buf.set(metaBytes, offset); offset += metaBytes.length;
    view.setUint32(offset, 134217728, false); offset += 4;
    view.setUint32(offset, crc32(buf.subarray(0, offset)), false);

    return buf;
}

describe('Probe regressions (promoted from root evidence scripts)', () => {

    it('forged 128MB payloadLen is rejected before any long coefficient walk', async () => {
        const blocks = createMockBlocks(60);
        const forged = buildContainerBytes({});
        const result = F5.embedRaw(blocks, forged, { seed: 'len-attack', k: 1 });
        expect(result.success).toBe(true);

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
