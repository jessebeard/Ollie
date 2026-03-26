import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Security: ID Generation', () => {
    it('ChunkManager.generateId should produce unique, standard UUIDs', () => {
        // Stub Math.random to always return 0.5 to prove vulnerability if it uses it
        const originalRandom = Math.random;
        Math.random = () => 0.5;

        const id1 = ChunkManager.generateId();
        const id2 = ChunkManager.generateId();

        Math.random = originalRandom;

        expect(id1).not.toBe(id2);

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id1)).toBe(true);
    });

    it('PasswordVault.generateId should produce unique, standard UUIDs', () => {
        const originalRandom = Math.random;
        Math.random = () => 0.5;

        const id1 = PasswordVault.generateId();
        const id2 = PasswordVault.generateId();

        Math.random = originalRandom;

        expect(id1).not.toBe(id2);

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(id1)).toBe(true);
    });
});
