import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: Secure ID Generation', () => {

    it('PasswordVault.generateId should not use Math.random', () => {
        const originalRandom = Math.random;
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
            Math.random = originalRandom;
        }
    });

    it('ChunkManager.generateId should not use Math.random', () => {
        const originalRandom = Math.random;
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
            Math.random = originalRandom;
        }
    });
});
