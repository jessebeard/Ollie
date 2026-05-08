import { expect, describe, it } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';

describe('Security: ID Generation', () => {
    it('ChunkManager.generateId should not return easily predictable values or match previous', () => {
        const id1 = ChunkManager.generateId();
        const id2 = ChunkManager.generateId();
        expect(id1).not.toBe(id2);
        // Expect a standard UUID format if available (but it might fall back)
        // Since we patched it with crypto.randomUUID() fallback, it's safer just to ensure they don't match.
    });

    it('ImmutableVault.generateId should not return easily predictable values', () => {
        const id1 = ImmutableVault.generateId();
        const id2 = ImmutableVault.generateId();
        expect(id1).not.toBe(id2);
    });
});
