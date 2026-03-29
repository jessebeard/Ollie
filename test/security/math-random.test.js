import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: ID Generation', () => {
    it('should not use Math.random for generating Vault IDs', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id = PasswordVault.generateId();
            expect(mathRandomCalled).toBe(false); // Fails since Math.random is used
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('should not use Math.random for generating Chunk IDs', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id = ChunkManager.generateId();
            expect(mathRandomCalled).toBe(false); // Fails since Math.random is used
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
