import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { generateSecureId } from '../../src/information-theory/cryptography/crypto-compat.js';

describe('Secure ID Generation', () => {
    it('should generate a secure UUID without calling Math.random() in ChunkManager', async () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        const id = ChunkManager.generateId();

        expect(randomCalled).toBe(false);
        expect(typeof id).toBe('string');
        expect(id.length >= 36).toBe(true);

        Math.random = originalRandom;
    });

    it('should generate a secure UUID without calling Math.random() in PasswordVault', async () => {
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        const id = PasswordVault.generateId();

        expect(randomCalled).toBe(false);
        expect(typeof id).toBe('string');
        expect(id.length > 36).toBe(true);
        expect(id.includes('-')).toBe(true);

        Math.random = originalRandom;
    });

    it('should format generateSecureId correctly', async () => {
        const idWithoutTimestamp = generateSecureId(false);
        expect(typeof idWithoutTimestamp).toBe('string');
        expect(idWithoutTimestamp.length).toBe(36);

        const idWithTimestamp = generateSecureId(true);
        expect(typeof idWithTimestamp).toBe('string');
        expect(idWithTimestamp.length > 36).toBe(true);
        const parts = idWithTimestamp.split('-');
        expect(parts.length).toBe(6);
    });
});
