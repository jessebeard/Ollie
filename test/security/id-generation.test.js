import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security Invariant Testing: ID Generation', () => {

    it('PasswordVault should not use Math.random for generating IDs', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        const id = PasswordVault.generateId();
        Math.random = originalMathRandom;

        expect(mathRandomCalled).toBe(false);
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(10);
    });

    it('ChunkManager should not use Math.random for generating IDs', () => {
        const originalMathRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        const id = ChunkManager.generateId();
        Math.random = originalMathRandom;

        expect(mathRandomCalled).toBe(false);
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(10);
    });

    it('PasswordVault IDs should be unique across many generations', () => {
        const idSet = new Set();
        const iterations = 1000;

        for (let i = 0; i < iterations; i++) {
            idSet.add(PasswordVault.generateId());
        }

        expect(idSet.size).toBe(iterations);
    });

    it('ChunkManager IDs should be unique across many generations', () => {
        const idSet = new Set();
        const iterations = 1000;

        for (let i = 0; i < iterations; i++) {
            idSet.add(ChunkManager.generateId());
        }

        expect(idSet.size).toBe(iterations);
    });

});
