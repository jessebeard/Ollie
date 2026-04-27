import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';

describe('Security: Identifiers', () => {
    it('ChunkManager should generate valid UUIDs', () => {
        const id = ChunkManager.generateId();

        // UUID v4 format: 8-4-4-4-12 hex characters
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        expect(uuidRegex.test(id)).toBe(true);
        expect(id.length).toBe(36);
    });

    it('ImmutableVault should generate valid UUIDs', () => {
        const id = ImmutableVault.generateId();

        // UUID v4 format: 8-4-4-4-12 hex characters
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        expect(uuidRegex.test(id)).toBe(true);
        expect(id.length).toBe(36);
    });

    it('should generate globally unique, non-colliding UUIDs', () => {
        const count = 1000;
        const ids = new Set();

        for (let i = 0; i < count; i++) {
            ids.add(cryptoInstance.randomUUID());
        }

        expect(ids.size).toBe(count);
    });
});
