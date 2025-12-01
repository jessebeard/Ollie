import { describe, it, expect } from '../../../test/utils/test-runner.js';
import { ChunkManager } from '../../../src/core/steganography/chunk-manager.js';

describe('ChunkManager', () => {
    describe('split', () => {
        it('should split data into chunks of specified size', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            const chunkSize = 3;

            const chunks = ChunkManager.split(data, chunkSize);

            expect(chunks.length).toBe(4); // 3 + 3 + 3 + 1
            expect(chunks[0].data.length).toBe(3);
            expect(chunks[1].data.length).toBe(3);
            expect(chunks[2].data.length).toBe(3);
            expect(chunks[3].data.length).toBe(1);
        });

        it('should assign unique chunk IDs', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
            const chunks = ChunkManager.split(data, 2);

            expect(chunks[0].chunkId).toBeDefined();
            expect(chunks[1].chunkId).toBeDefined();
            expect(chunks[2].chunkId).toBeDefined();

            // All chunks should have the same chunkId (they belong to the same dataset)
            expect(chunks[0].chunkId).toBe(chunks[1].chunkId);
            expect(chunks[1].chunkId).toBe(chunks[2].chunkId);
        });

        it('should assign correct indices and total count', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const chunks = ChunkManager.split(data, 2);

            expect(chunks.length).toBe(3);

            expect(chunks[0].index).toBe(0);
            expect(chunks[0].total).toBe(3);

            expect(chunks[1].index).toBe(1);
            expect(chunks[1].total).toBe(3);

            expect(chunks[2].index).toBe(2);
            expect(chunks[2].total).toBe(3);
        });

        it('should include checksum for each chunk', () => {
            const data = new Uint8Array([1, 2, 3, 4]);
            const chunks = ChunkManager.split(data, 2);

            expect(chunks[0].checksum).toBeDefined();
            expect(chunks[1].checksum).toBeDefined();

            // Different data should produce different checksums
            expect(chunks[0].checksum).not.toBe(chunks[1].checksum);
        });
    });

    describe('reassemble', () => {
        it('should reassemble chunks into original data', () => {
            const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
            const chunks = ChunkManager.split(original, 3);

            const reassembled = ChunkManager.reassemble(chunks);

            expect(reassembled.length).toBe(original.length);
            for (let i = 0; i < original.length; i++) {
                expect(reassembled[i]).toBe(original[i]);
            }
        });

        it('should handle single chunk', () => {
            const original = new Uint8Array([1, 2, 3]);
            const chunks = ChunkManager.split(original, 10); // Larger than data

            expect(chunks.length).toBe(1);

            const reassembled = ChunkManager.reassemble(chunks);
            expect(reassembled.length).toBe(3);
            expect(reassembled[0]).toBe(1);
        });

        it('should reassemble chunks in correct order even if shuffled', () => {
            const original = new Uint8Array([1, 2, 3, 4, 5, 6]);
            const chunks = ChunkManager.split(original, 2);

            // Shuffle chunks
            const shuffled = [chunks[2], chunks[0], chunks[1]];

            const reassembled = ChunkManager.reassemble(shuffled);

            expect(reassembled.length).toBe(6);
            for (let i = 0; i < original.length; i++) {
                expect(reassembled[i]).toBe(original[i]);
            }
        });

        it('should throw error if chunks are missing', () => {
            const original = new Uint8Array([1, 2, 3, 4, 5, 6]);
            const chunks = ChunkManager.split(original, 2);

            // Remove middle chunk
            const incomplete = [chunks[0], chunks[2]];

            let errorThrown = false;
            try {
                ChunkManager.reassemble(incomplete);
            } catch (e) {
                errorThrown = true;
            }

            expect(errorThrown).toBe(true);
        });

        it('should throw error if chunk IDs do not match', () => {
            const data1 = new Uint8Array([1, 2, 3]);
            const data2 = new Uint8Array([4, 5, 6]);

            const chunks1 = ChunkManager.split(data1, 2);
            const chunks2 = ChunkManager.split(data2, 2);

            // Mix chunks from different datasets
            const mixed = [chunks1[0], chunks2[0]];

            let errorThrown = false;
            try {
                ChunkManager.reassemble(mixed);
            } catch (e) {
                errorThrown = true;
            }

            expect(errorThrown).toBe(true);
        });
    });
});
