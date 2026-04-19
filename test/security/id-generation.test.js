import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';

describe('Security: ID Generation', () => {
    it('Immutable Vault should generate valid UUID v4 IDs', () => {
        const id = PasswordVault.generateId();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });

    it('Immutable Vault should not use Math.random for ID generation', () => {
        const originalMathRandom = Math.random;
        let called = false;
        Math.random = () => {
            called = true;
            return originalMathRandom();
        };

        try {
            PasswordVault.generateId();
            expect(called).toBe(false);
        } finally {
            Math.random = originalMathRandom;
        }
    });

    it('Chunk Manager should generate valid UUID v4 IDs', () => {
        const id = ChunkManager.generateId();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });

    it('Chunk Manager should not use Math.random for ID generation', () => {
        const originalMathRandom = Math.random;
        let called = false;
        Math.random = () => {
            called = true;
            return originalMathRandom();
        };

        try {
            ChunkManager.generateId();
            expect(called).toBe(false);
        } finally {
            Math.random = originalMathRandom;
        }
    });
});
