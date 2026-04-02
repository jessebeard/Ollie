import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: Insecure Randomness Prevention', () => {
    it('should not use Math.random for generating IDs in PasswordVault', () => {
        const originalMathRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return 0.5;
        };

        try {
            const id = PasswordVault.generateId();

            expect(randomCalled).toBe(false);
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('should not use Math.random for generating IDs in ChunkManager', () => {
        const originalMathRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return 0.5;
        };

        try {
            const id = ChunkManager.generateId();

            expect(randomCalled).toBe(false);
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
