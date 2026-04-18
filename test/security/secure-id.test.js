import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Secure ID Generation', () => {
    it('PasswordVault should generate cryptographically secure IDs', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = PasswordVault.generateId();

            // Assert Math.random was NOT called
            expect(randomCalled).toBe(false);

            // Validate UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('ChunkManager should generate cryptographically secure IDs', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = ChunkManager.generateId();

            // Assert Math.random was NOT called
            expect(randomCalled).toBe(false);

            // Validate UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });
});
