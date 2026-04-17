import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Math.random Security', () => {
    it('should not use Math.random for generating chunk IDs', () => {
        const originalMathRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalMathRandom();
        };

        try {
            const id = ChunkManager.generateId();
            expect(randomCalled).toBe(false);
            expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)).toBe(true);
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('should not use Math.random for generating vault entry IDs', () => {
        const originalMathRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalMathRandom();
        };

        try {
            const id = PasswordVault.generateId();
            expect(randomCalled).toBe(false);
            expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)).toBe(true);
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
