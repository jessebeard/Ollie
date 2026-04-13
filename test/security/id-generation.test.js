import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';

describe('Cryptographically Secure ID Generation', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    it('ChunkManager should generate valid UUID v4 without Math.random', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return 0;
        };

        try {
            const id = ChunkManager.generateId();
            expect(randomCalled).toBe(false);
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('ImmutableVault should generate valid UUID v4 without Math.random', () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return 0;
        };

        try {
            const id = ImmutableVault.generateId();
            expect(randomCalled).toBe(false);
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });
});
