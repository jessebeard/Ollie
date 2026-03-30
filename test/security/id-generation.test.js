import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: ID Generation', () => {
    it('ImmutableVault should not use Math.random for ID generation', () => {
        const originalRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        const id = ImmutableVault.generateId();

        Math.random = originalRandom;

        expect(mathRandomCalled).toBe(false, 'Math.random should not be used for security-critical ID generation');
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });

    it('ChunkManager should not use Math.random for ID generation', () => {
        const originalRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        const id = ChunkManager.generateId();

        Math.random = originalRandom;

        expect(mathRandomCalled).toBe(false, 'Math.random should not be used for security-critical ID generation');
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });
});
