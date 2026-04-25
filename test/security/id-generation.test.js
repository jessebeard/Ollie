import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Secure ID Generation', () => {
    it('ChunkManager.generateId should not use Math.random and generate valid UUID v4', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        try {
            Math.random = () => {
                mathRandomCalled = true;
                return originalMathRandom();
            };

            const id = ChunkManager.generateId();

            expect(mathRandomCalled).toBe(false);
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('PasswordVault.generateId should not use Math.random and generate valid UUID v4', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        try {
            Math.random = () => {
                mathRandomCalled = true;
                return originalMathRandom();
            };

            const id = PasswordVault.generateId();

            expect(mathRandomCalled).toBe(false);
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
