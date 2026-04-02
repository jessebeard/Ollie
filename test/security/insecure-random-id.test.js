import { describe, it, expect } from '../../test/utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Sentinel Security: Secure ID Generation', () => {
    it('PasswordVault.generateId() should not use Math.random and should return a valid UUID', () => {
        const originalMathRandom = Math.random;
        Math.random = () => {
            throw new Error('Math.random() was called unexpectedly. It is not cryptographically secure.');
        };
        try {
            const id = PasswordVault.generateId();
            expect(typeof id).toBe('string');
            // Validate it's a standard UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('ChunkManager.generateId() should not use Math.random and should return a valid UUID', () => {
        const originalMathRandom = Math.random;
        Math.random = () => {
            throw new Error('Math.random() was called unexpectedly. It is not cryptographically secure.');
        };

        try {
            const id = ChunkManager.generateId();
            expect(typeof id).toBe('string');
            // Validate it's a standard UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
