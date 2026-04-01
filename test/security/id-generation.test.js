import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Sentinel: Secure ID Generation', () => {
    it('should not use Math.random() for Vault ID generation', () => {
        let mathRandomCalled = false;
        const originalRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return originalRandom();
        };

        try {
            const id = PasswordVault.generateId();
            expect(mathRandomCalled).toBe(false);
            expect(id).not.toBeNull();
            expect(id.length).toBeGreaterThan(10);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('should not use Math.random() for ChunkManager ID generation', () => {
        let mathRandomCalled = false;
        const originalRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return originalRandom();
        };

        try {
            const id = ChunkManager.generateId();
            expect(mathRandomCalled).toBe(false);
            expect(id).not.toBeNull();
            expect(id.length).toBeGreaterThan(10);
        } finally {
            Math.random = originalRandom;
        }
    });
});
