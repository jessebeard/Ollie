import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Security: ID Generation', () => {
    it('ChunkManager should generate cryptographically secure IDs', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        const id = ChunkManager.generateId();

        Math.random = originalRandom;

        expect(randomCalled).toBe(false);

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });

    it('PasswordVault should generate cryptographically secure IDs', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        const id = PasswordVault.generateId();

        Math.random = originalRandom;

        expect(randomCalled).toBe(false);

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });
});
