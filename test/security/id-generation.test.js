import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('ID Generation Security', () => {
    it('PasswordVault should not use Math.random()', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;

        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id1 = PasswordVault.generateId();
            const id2 = PasswordVault.generateId();

            expect(mathRandomCalled).toBe(false);
            expect(id1).not.toBe(id2);
            expect(id1.includes('.')).toBe(false);
            expect(id1.length).toBeGreaterThan(15);
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('ChunkManager should not use Math.random()', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;

        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id1 = ChunkManager.generateId();
            const id2 = ChunkManager.generateId();

            expect(mathRandomCalled).toBe(false);
            expect(id1).not.toBe(id2);
            expect(id1.length).toBe(36);
            expect(id1.includes('-')).toBe(true);
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
