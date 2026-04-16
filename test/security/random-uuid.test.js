import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Secure UUID Generation', () => {
    it('PasswordVault uses cryptographically secure UUID', () => {
        const originalRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return originalRandom();
        };

        const id = PasswordVault.generateId();

        Math.random = originalRandom;

        expect(mathRandomCalled).toBe(false);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });

    it('ChunkManager uses cryptographically secure UUID', () => {
        const originalRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return originalRandom();
        };

        const id = ChunkManager.generateId();

        Math.random = originalRandom;

        expect(mathRandomCalled).toBe(false);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id)).toBe(true);
    });
});
