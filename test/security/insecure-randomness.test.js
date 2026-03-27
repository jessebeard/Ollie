import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: Insecure Randomness Mitigation', () => {
    it('PasswordVault.generateId() should not use Math.random()', () => {
        const originalMathRandom = Math.random;
        Math.random = () => {
            throw new Error('Math.random() was called, which is insecure for this operation!');
        };

        try {
            expect(() => {
                const id = PasswordVault.generateId();
                expect(id).toBeDefined();
                expect(typeof id).toBe('string');
                expect(id.length).toBeGreaterThan(0);
            }).not.toThrow();
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('ChunkManager.generateId() should not use Math.random()', () => {
        const originalMathRandom = Math.random;
        Math.random = () => {
            throw new Error('Math.random() was called, which is insecure for this operation!');
        };

        try {
            expect(() => {
                const id = ChunkManager.generateId();
                expect(id).toBeDefined();
                expect(typeof id).toBe('string');
                expect(id.length).toBeGreaterThan(0);
            }).not.toThrow();
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
