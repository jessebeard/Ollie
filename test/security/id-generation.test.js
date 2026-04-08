import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Security: ID Generation', () => {
    it('should generate cryptographically secure UUID v4', () => {
        // Mock Math.random to ensure it is not used
        const originalRandom = Math.random;
        let randomCalled = false;
        Math.random = () => {
            randomCalled = true;
            return originalRandom();
        };

        try {
            const id = PasswordVault.generateId();

            // Validate UUID v4 format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);

            // Assert Math.random was not called
            expect(randomCalled).toBe(false);
        } finally {
            // Restore Math.random
            Math.random = originalRandom;
        }
    });

    it('should generate unique IDs', () => {
        const id1 = PasswordVault.generateId();
        const id2 = PasswordVault.generateId();

        expect(id1 !== id2).toBe(true);
    });
});
