import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('ID Generation Security', () => {
    it('should not use Math.random for PasswordVault.generateId', () => {
        const originalRandom = Math.random;
        Math.random = () => { throw new Error('Math.random called'); };
        try {
            const id = PasswordVault.generateId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('should not use Math.random for ChunkManager.generateId', () => {
        const originalRandom = Math.random;
        Math.random = () => { throw new Error('Math.random called'); };
        try {
            const id = ChunkManager.generateId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        } finally {
            Math.random = originalRandom;
        }
    });
});
