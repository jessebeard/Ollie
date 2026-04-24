import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';

describe('Security: ID Generation', () => {
    it('ChunkManager.generateId should not use Math.random', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return originalMathRandom();
        };

        const id = ChunkManager.generateId();

        Math.random = originalMathRandom;

        expect(mathRandomCalled).toBe(false);

        // Assert it is a valid v4 UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });

    it('ImmutableVault.generateId should not use Math.random', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return originalMathRandom();
        };

        const id = ImmutableVault.generateId();

        Math.random = originalMathRandom;

        expect(mathRandomCalled).toBe(false);

        // Assert it is a valid v4 UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });
});
