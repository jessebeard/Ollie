import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Secure ID Generation', () => {
    it('ChunkManager.generateId() should use crypto UUID', () => {
        const id = ChunkManager.generateId();
        expect(id.length).toBe(36);
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidV4Regex.test(id)).toBe(true);
    });

    it('PasswordVault.generateId() should use crypto UUID', () => {
        const id = PasswordVault.generateId();
        expect(id.length).toBe(36);
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidV4Regex.test(id)).toBe(true);
    });

    it('ID generation should not use Math.random', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return 0.5;
        };

        ChunkManager.generateId();
        PasswordVault.generateId();

        Math.random = originalRandom;
        expect(randomCalled).toBe(false);
    });
});
