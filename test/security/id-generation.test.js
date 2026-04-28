import { describe, it, expect } from '../../test/utils/test-runner.js';
import { PasswordVault as ImmutablePasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Sentinel: Security Invariant Testing - Secure ID Generation', () => {

    // Property: UUIDs must be correctly formatted v4 UUIDs
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    it('Immutable PasswordVault generates secure v4 UUIDs', () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
            const id = ImmutablePasswordVault.generateId();
            expect(uuidV4Regex.test(id)).toBe(true);
            ids.add(id);
        }
        // Property: No collisions in 1000 generations
        expect(ids.size).toBe(1000);
    });

    it('ChunkManager generates secure v4 UUIDs', () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
            const id = ChunkManager.generateId();
            expect(uuidV4Regex.test(id)).toBe(true);
            ids.add(id);
        }
        // Property: No collisions in 1000 generations
        expect(ids.size).toBe(1000);
    });

});
