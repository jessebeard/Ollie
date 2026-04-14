import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('UUID Generation Security', () => {
    it('PasswordVault should use secure randomUUID', () => {
        const id = PasswordVault.generateId();
        const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(regex.test(id)).toBe(true);
    });

    it('ChunkManager should use secure randomUUID', () => {
        const id = ChunkManager.generateId();
        const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(regex.test(id)).toBe(true);
    });

    it('should not call Math.random', () => {
        const originalRandom = Math.random;
        let called = false;
        Math.random = () => {
            called = true;
            return originalRandom();
        };

        PasswordVault.generateId();
        ChunkManager.generateId();

        Math.random = originalRandom;

        expect(called).toBe(false);
    });
});
