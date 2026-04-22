import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: Secure ID Generation', () => {
    const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    it('ImmutableVault should generate secure UUIDs', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = ImmutableVault.generateId();
            expect(randomCalled).toBe(false);

            if (!uuidv4Regex.test(id)) {
                throw new Error(`Expected ID to be a UUIDv4, got ${id}`);
            }
        } finally {
            Math.random = originalRandom;
        }
    });

    it('ChunkManager should generate secure UUIDs', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = ChunkManager.generateId();
            expect(randomCalled).toBe(false);

            if (!uuidv4Regex.test(id)) {
                throw new Error(`Expected ID to be a UUIDv4, got ${id}`);
            }
        } finally {
            Math.random = originalRandom;
        }
    });
});
