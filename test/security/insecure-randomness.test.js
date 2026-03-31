import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: Predictable Randomness', () => {

    it('PasswordVault.generateId() should not rely on Math.random()', () => {
        let originalRandom = Math.random;
        Math.random = () => 0.5; // predictable value

        try {
            const id1 = PasswordVault.generateId();
            const id2 = PasswordVault.generateId();
            expect(id1).not.toBe(id2);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('ChunkManager.generateId() should not rely on Math.random()', () => {
        let originalRandom = Math.random;
        Math.random = () => 0.5; // predictable value

        try {
            const id1 = ChunkManager.generateId();
            const id2 = ChunkManager.generateId();
            expect(id1).not.toBe(id2);
        } finally {
            Math.random = originalRandom;
        }
    });
});
