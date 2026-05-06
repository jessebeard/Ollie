import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { describe, it, expect } from '../utils/test-runner.js';

describe('Secure ID Generation', () => {
    it('does not rely on Math.random for uniqueness when crypto is available', () => {
        const originalMathRandom = Math.random;
        try {
            // Mock Math.random to always return a constant
            Math.random = () => 0.5;

            const chunkId1 = ChunkManager.generateId();
            const chunkId2 = ChunkManager.generateId();
            if (chunkId1 === chunkId2) throw new Error("ChunkManager IDs are not unique");

            const vaultId1 = ImmutableVault.generateId();
            const vaultId2 = ImmutableVault.generateId();
            if (vaultId1 === vaultId2) throw new Error("ImmutableVault IDs are not unique");

        } finally {
            Math.random = originalMathRandom;
        }
    });
});
