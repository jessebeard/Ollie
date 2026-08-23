import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { BatchExtractor } from '../../src/information-theory/steganography/batch-extractor.js';
import { crc32 } from '../../src/utils/crc32.js';

function makeChunks(ids, specs) {
    return specs.map(([index, total, fill]) => ({
        chunkId: ids,
        index,
        total,
        data: new Uint8Array(4).fill(fill),
        checksum: ChunkManager.calculateChecksum(new Uint8Array(4).fill(fill))
    }));
}

describe('Chunk checksum integrity', () => {

    it('calculateChecksum produces the CRC32 of the data', () => {
        const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(ChunkManager.calculateChecksum(data)).toBe(crc32(data));
    });

    it('split refuses non-positive or non-integer chunk sizes', () => {
        let threw = false;
        try {
            ChunkManager.split(new Uint8Array(100), 0);
        } catch (e) {
            threw = true;
        }
        expect(threw).toBe(true);

        threw = false;
        try {
            ChunkManager.split(new Uint8Array(100), -5);
        } catch (e) {
            threw = true;
        }
        expect(threw).toBe(true);
    });

    it('reassemble rejects a tampered chunk via checksum mismatch', () => {
        const data = new Uint8Array(35);
        for (let i = 0; i < data.length; i++) data[i] = i;
        const chunks = ChunkManager.split(data, 10);

        // Carrier corruption: payload bytes change, the stored checksum does not
        const storedChecksum = chunks[2].checksum;
        chunks[2].data[0] ^= 0xFF;
        chunks[2].checksum = storedChecksum;

        const [result, err] = ChunkManager.reassemble(chunks);
        expect(result).toEqual(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase().includes('checksum')).toBe(true);
        expect(err.message.includes('2')).toBe(true);
    });

    it('reassemble still succeeds when every checksum matches', () => {
        const data = new Uint8Array(35);
        for (let i = 0; i < data.length; i++) data[i] = (i * 13) & 0xFF;
        const chunks = ChunkManager.split(data, 10);

        const [result, err] = ChunkManager.reassemble(chunks);
        expect(err).toEqual(null);
        expect(result.length).toBe(35);
        for (let i = 0; i < data.length; i++) {
            expect(result[i]).toBe(data[i]);
        }
    });
});

describe('Chunk-group selection hardening', () => {

    it('rejects an attacker-inflated chunk.total instantly without materializing arrays', () => {
        const records = makeChunks('set-a', [[0, 10000000, 1], [1, 10000000, 2]]);

        const started = Date.now();
        const result = BatchExtractor.selectCompleteGroup(records, 2);
        const elapsed = Date.now() - started;

        expect(result.group).toEqual(null);
        expect(result.error instanceof Error).toBe(true);
        expect(elapsed < 2000).toBe(true);
    });

    it('rejects duplicate indices within a group', () => {
        const records = makeChunks('dup', [[0, 2, 1], [0, 2, 2]]);
        const result = BatchExtractor.selectCompleteGroup(records, 2);
        expect(result.group).toEqual(null);
        expect(result.error instanceof Error).toBe(true);
    });

    it('rejects totals exceeding the number of carrier files provided', () => {
        const records = makeChunks('big-total', [[0, 9, 1], [1, 9, 2]]);
        const result = BatchExtractor.selectCompleteGroup(records, 2);
        expect(result.group).toEqual(null);
    });

    it('accepts a genuinely complete contiguous group', () => {
        const records = makeChunks('good', [[0, 3, 1], [1, 3, 2], [2, 3, 3]]);
        const result = BatchExtractor.selectCompleteGroup(records, 5);
        expect(result.error).toEqual(null);
        expect(result.group.length).toBe(3);
        expect(result.group[0].index).toBe(0);
        expect(result.group[2].index).toBe(2);
    });
});
