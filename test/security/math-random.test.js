import { describe, it, expect } from '../../test/utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Security: Math.random() usage', () => {
    it('ChunkManager.generateId should not use Math.random()', () => {
        const originalRandom = Math.random;
        let called = false;
        Math.random = () => {
            called = true;
            return 0.5;
        };

        try {
            ChunkManager.generateId();
            expect(called).toBe(false);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('PasswordVault.generateId should not use Math.random()', () => {
        const originalRandom = Math.random;
        let called = false;
        Math.random = () => {
            called = true;
            return 0.5;
        };

        try {
            PasswordVault.generateId();
            expect(called).toBe(false);
        } finally {
            Math.random = originalRandom;
        }
    });
});
