import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('\x1b[1mSecurity: ID Generation (Math.random elimination)\x1b[0m', () => {
    it('should generate valid UUIDs without using Math.random in ChunkManager', () => {
        // Mock Math.random to throw if called
        const originalRandom = Math.random;
        Math.random = () => {
            throw new Error('Math.random() was called but should have been eliminated');
        };

        try {
            const id = ChunkManager.generateId();

            // Check UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            // Restore original Math.random
            Math.random = originalRandom;
        }
    });

    it('should generate valid UUIDs without using Math.random in PasswordVault', () => {
        // Mock Math.random to throw if called
        const originalRandom = Math.random;
        Math.random = () => {
            throw new Error('Math.random() was called but should have been eliminated');
        };

        try {
            const id = PasswordVault.generateId();

            // Check UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            // Restore original Math.random
            Math.random = originalRandom;
        }
    });
});
