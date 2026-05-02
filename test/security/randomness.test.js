import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: ID Generation', () => {
    it('ImmutableVault should generate cryptographically secure UUIDs', () => {
        const id = ImmutableVault.generateId();
        // Check for UUIDv4 format
        expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)).toBe(true);
    });

    it('ChunkManager should generate cryptographically secure UUIDs', () => {
        const id = ChunkManager.generateId();
        // Check for UUIDv4 format
        expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)).toBe(true);
    });
});
