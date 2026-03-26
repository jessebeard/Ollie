import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('PasswordVault ID Generation Security', () => {
    it('generates secure identifiers without using Math.random()', () => {
        const originalRandom = Math.random;
        let randomCalled = false;

        // Mock Math.random to detect if it's being used
        Math.random = () => {
            randomCalled = true;
            return 0.5;
        };

        try {
            const id1 = PasswordVault.generateId();
            const id2 = PasswordVault.generateId();

            expect(randomCalled).toBe(false);
            expect(id1).not.toBe(id2);
            expect(typeof id1).toBe('string');
            expect(id1.length).toBeGreaterThan(15);
        } finally {
            // Restore original Math.random
            Math.random = originalRandom;
        }
    });
});
