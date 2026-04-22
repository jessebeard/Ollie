import { describe, it, expect } from '../../test/utils/test-runner.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: ID Generation', () => {
    it('ImmutableVault should use cryptographically secure random values', () => {
        let mathRandomCalled = false;
        const originalMathRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        const id = ImmutableVault.generateId();

        Math.random = originalMathRandom;

        expect(mathRandomCalled).toBe(false);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });

    it('ChunkManager should use cryptographically secure random values', () => {
        let mathRandomCalled = false;
        const originalMathRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        const id = ChunkManager.generateId();

        Math.random = originalMathRandom;

        expect(mathRandomCalled).toBe(false);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });
});
