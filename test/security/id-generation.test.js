import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: Cryptographically Secure ID Generation', () => {
    it('ImmutableVault should generate secure UUIDv4 and not use Math.random', () => {
        // Mock Math.random to track calls
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = ImmutableVault.generateId();

            // Should be a valid UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);

            // Should NOT have used Math.random
            expect(randomCalled).toBe(false);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('ChunkManager should generate secure UUIDv4 and not use Math.random', () => {
        // Mock Math.random to track calls
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = ChunkManager.generateId();

            // Should be a valid UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);

            // Should NOT have used Math.random
            expect(randomCalled).toBe(false);
        } finally {
            Math.random = originalRandom;
        }
    });
});
