import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Security: ID Generation', () => {
    it('should generate secure UUID v4 IDs in ChunkManager without Math.random', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return 0.5; // Predictable return if called
        };

        try {
            const id = ChunkManager.generateId();

            // Check if Math.random was called
            expect(randomCalled).toBe(false);

            // Validate UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('should generate secure UUID v4 IDs in PasswordVault without Math.random', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return 0.5;
        };

        try {
            const id = PasswordVault.generateId();

            // Check if Math.random was called
            expect(randomCalled).toBe(false);

            // Validate UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });
});
