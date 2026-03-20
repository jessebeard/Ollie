import { describe, it, expect } from '../../utils/test-runner.js';
import { ChunkManager } from '../../../src/information-theory/steganography/chunk-manager.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('ChunkManager (Property-Based Tests)', () => {

    it('should calculate valid UUIDs', () => {
        const ids = new Set();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        for (let i = 0; i < 100; i++) {
            const id = ChunkManager.generateId();
            expect(uuidRegex.test(id)).toBe(true);
            ids.add(id);
        }
        expect(ids.size).toBe(100);
    });

    it('Property: Reassembly Symmetry (split then reassemble yields original data)', async () => {
        // Fuzz byte arrays of varying lengths and random chunk sizes
        await assertProperty(
            // Use 1 to 1000 bytes to not blow up mocked image bounds limits
            [Arbitrary.byteArray(1, 1000), Arbitrary.positiveInteger(1024)],
            async (dataBytes, chunkSize) => {
                const chunks = ChunkManager.split(dataBytes, chunkSize);

                // Properties of the split
                let totalExpected = Math.ceil(dataBytes.length / chunkSize);
                expect(chunks.length).toBe(totalExpected);

                if (chunks.length > 0) {
                    const expectedId = chunks[0].chunkId;
                    for (let i = 0; i < chunks.length; i++) {
                        expect(chunks[i].chunkId).toBe(expectedId);
                        expect(chunks[i].index).toBe(i);
                        expect(chunks[i].total).toBe(totalExpected);
                    }
                }

                // Reassembly invariant
                const [reassembled, err] = ChunkManager.reassemble(chunks);
                expect(err).toEqual(null);
                expect(reassembled.length).toBe(dataBytes.length);

                for (let i = 0; i < dataBytes.length; i++) {
                    if (reassembled[i] !== dataBytes[i]) return false;
                }

                return true;
            },
            50
        );
    });

    it('Property: Shuffle Recovery (reassemble out-of-order chunks yields original data)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(10, 1000), Arbitrary.positiveInteger(500)],
            async (dataBytes, randomChunkSize) => {
                const chunkSize = Math.max(1, randomChunkSize);
                const chunks = ChunkManager.split(dataBytes, chunkSize);

                // Shuffle the chunks randomly
                const shuffled = [...chunks];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }

                const [reassembled, err] = ChunkManager.reassemble(shuffled);
                expect(err).toEqual(null);
                expect(reassembled.length).toBe(dataBytes.length);

                for (let i = 0; i < dataBytes.length; i++) {
                    if (reassembled[i] !== dataBytes[i]) return false;
                }

                return true;
            },
            50
        );
    });

    it('Property: Incomplete Payload Rejection', async () => {
        await assertProperty(
            [Arbitrary.byteArray(50, 1000), Arbitrary.positiveInteger(500)],
            async (dataBytes, randomChunkSize) => {
                const chunkSize = Math.max(1, randomChunkSize);
                const chunks = ChunkManager.split(dataBytes, chunkSize);

                if (chunks.length < 2) return true; // Can't remove a chunk if there's only 1

                // Remove a random chunk
                const removeIndex = Math.floor(Math.random() * chunks.length);
                const incomplete = chunks.filter((_, i) => i !== removeIndex);

                const [data, err] = ChunkManager.reassemble(incomplete);
                expect(data).toEqual(null);
                expect(err !== null).toBe(true);
                expect(err.message.includes('Missing chunks')).toBe(true);

                return true;
            },
            50
        );
    });

    it('Property: ID Mismatch Rejection (mixing datasets fails)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(10, 1000), Arbitrary.byteArray(10, 1000), Arbitrary.positiveInteger(100)],
            async (data1, data2, randomChunkSize) => {
                const chunkSize = Math.max(1, randomChunkSize);
                const chunks1 = ChunkManager.split(data1, chunkSize);
                const chunks2 = ChunkManager.split(data2, chunkSize);

                if (chunks1.length === 0 || chunks2.length === 0) return true;

                // Take first chunk of dataset 1, and rest from dataset 2.
                // It is statistically impossible for two separate unseeded generations to yield the same 16-char string ID
                const mixed = [chunks1[0], ...chunks2];

                const [data, err] = ChunkManager.reassemble(mixed);
                expect(data).toEqual(null);
                expect(err !== null).toBe(true);
                expect(err.message.includes('Chunk IDs do not match')).toBe(true);

                return true;
            },
            50
        );
    });
});
