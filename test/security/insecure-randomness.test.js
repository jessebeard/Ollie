import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: Secure Randomness for ID Generation', () => {
    it('should use cryptographically secure randomUUID instead of Math.random() in PasswordVault', () => {
        const originalRandom = Math.random;
        let randomCalled = false;

        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = PasswordVault.generateId();

            // Verify Math.random was not called
            expect(randomCalled).toBe(false);

            // Verify correct UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            // Restore Math.random
            Math.random = originalRandom;
        }
    });

    it('should use cryptographically secure randomUUID instead of Math.random() in ChunkManager', () => {
        const originalRandom = Math.random;
        let randomCalled = false;

        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = ChunkManager.generateId();

            // Verify Math.random was not called
            expect(randomCalled).toBe(false);

            // Verify correct UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            // Restore Math.random
            Math.random = originalRandom;
        }
    });
});
