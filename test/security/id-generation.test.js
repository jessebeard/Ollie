import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
// To test app/vault.js we would need the UI version of PasswordVault which is hard to import cleanly here
// because it shares the same name and expects DOM.
// We'll focus on testing the core ones, as app/vault.js is mostly a wrapper.

describe('Security: ID Generation', () => {
    it('should generate secure UUIDs without relying on Math.random', () => {
        // Stub Math.random to always return a predictable value
        const originalRandom = Math.random;
        Math.random = () => 0.5;

        const vaultId1 = PasswordVault.generateId();
        const vaultId2 = PasswordVault.generateId();

        const chunkId1 = ChunkManager.generateId();
        const chunkId2 = ChunkManager.generateId();

        Math.random = originalRandom;

        // Secure generation shouldn't be affected by Math.random
        expect(vaultId1 !== vaultId2).toBe(true);
        expect(chunkId1 !== chunkId2).toBe(true);
    });
});
