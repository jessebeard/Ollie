import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';

describe('Math.random Replacement Tests', () => {
    it('ChunkManager generates secure UUIDs without Math.random', () => {
        const originalRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id = ChunkManager.generateId();
            expect(mathRandomCalled).toBe(false);

            // Should be a valid UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });
});
