import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Secure ID Generation', () => {
    it('PasswordVault should not use Math.random for generateId', () => {
        const originalRandom = Math.random;
        let mathRandomCalled = false;
        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const id = PasswordVault.generateId();
            expect(mathRandomCalled).toBe(false);

            // Should be a valid UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });
});
