import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('ID Generation Security', () => {
    it('should generate secure UUIDs instead of using Math.random for Vaults', () => {
        const originalRandom = Math.random;
        let randomCalled = false;

        Math.random = () => {
            randomCalled = true;
            return 0.5;
        };

        const id = PasswordVault.generateId();

        Math.random = originalRandom;

        expect(randomCalled).toBe(false);
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        expect(id.length).toBe(36);
        expect(id.charAt(14)).toBe('4');
        expect(['8', '9', 'a', 'b']).toContain(id.charAt(19));
    });

    it('should generate secure UUIDs instead of using Math.random for ChunkManager', () => {
        const originalRandom = Math.random;
        let randomCalled = false;

        Math.random = () => {
            randomCalled = true;
            return 0.5;
        };

        const id = ChunkManager.generateId();

        Math.random = originalRandom;

        expect(randomCalled).toBe(false);
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        expect(id.length).toBe(36);
        expect(id.charAt(14)).toBe('4');
        expect(['8', '9', 'a', 'b']).toContain(id.charAt(19));
    });
});
