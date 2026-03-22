import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';

describe('Sentinel: ChunkManager Security - ID Generation', () => {
    it('generates IDs that conform to UUID format', () => {
        const id = ChunkManager.generateId();

        // UUID format regex (v4 or general format)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        expect(uuidRegex.test(id)).toBe(true);
    });

    it('generates unique IDs without collisions', () => {
        const numIds = 1000;
        const generatedIds = new Set();

        for (let i = 0; i < numIds; i++) {
            const id = ChunkManager.generateId();
            expect(generatedIds.has(id)).toBe(false);
            generatedIds.add(id);
        }

        expect(generatedIds.size).toBe(numIds);
    });

    it('uses Web Crypto API for secure ID generation (mocks)', () => {
        // We mock randomUUID temporarily to ensure it's being called
        const originalRandomUUID = cryptoInstance.randomUUID;
        let wasCalled = false;

        cryptoInstance.randomUUID = () => {
            wasCalled = true;
            return 'mocked-chunk-uuid-4567';
        };

        try {
            const id = ChunkManager.generateId();
            expect(wasCalled).toBe(true);
            expect(id).toBe('mocked-chunk-uuid-4567');
        } finally {
            // Restore
            cryptoInstance.randomUUID = originalRandomUUID;
        }
    });

    it('PBT: Chunk manager splits assign ID to all chunks correctly', () => {
        assertProperty(
            Arbitrary.byteArray(100, 1000), // Random data payload
            Arbitrary.integer(10, 50),       // Chunk size
            (data, chunkSize) => {
                const chunks = ChunkManager.split(data, chunkSize);

                // Assert chunks is not empty and has same UUID for all chunks
                if (chunks.length === 0) return false;

                const sharedId = chunks[0].chunkId;
                if (!sharedId || typeof sharedId !== 'string' || sharedId.length !== 36) return false;

                for (let i = 0; i < chunks.length; i++) {
                    if (chunks[i].chunkId !== sharedId) return false;
                }

                return true;
            }
        );
    });
});
