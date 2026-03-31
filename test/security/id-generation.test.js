import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security Invariants: ID Generation', () => {
    it('PasswordVault should not use Math.random() for ID generation', async () => {
        let mathRandomCalled = false;
        const originalMathRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id = PasswordVault.generateId();
            expect(mathRandomCalled).toBe(false);
            expect(id).toBeDefined();
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('ChunkManager should not use Math.random() for ID generation', async () => {
        let mathRandomCalled = false;
        const originalMathRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id = ChunkManager.generateId();
            expect(mathRandomCalled).toBe(false);
            expect(id).toBeDefined();
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
