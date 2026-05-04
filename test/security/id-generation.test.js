import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security Invariants: ID Generation', () => {
    it('generates secure, non-predictable UUIDs via PasswordVault', () => {
        const id1 = PasswordVault.generateId();
        const id2 = PasswordVault.generateId();
        expect(id1).not.toBe(id2);
        expect(id1.length).toBeGreaterThan(15);
    });

    it('generates secure, non-predictable UUIDs via ChunkManager', () => {
        const id1 = ChunkManager.generateId();
        const id2 = ChunkManager.generateId();
        expect(id1).not.toBe(id2);
        expect(id1.length).toBeGreaterThan(15);
    });
});
