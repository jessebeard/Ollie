import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('PasswordVault - Security', () => {
    describe('generateId', () => {
        it('should use cryptoInstance.randomUUID instead of Math.random', () => {
            // Mock Math.random to detect insecure usage
            const originalRandom = Math.random;
            let randomCalled = false;
            Math.random = () => {
                randomCalled = true;
                return originalRandom();
            };

            try {
                const id = PasswordVault.generateId();

                // 1. Math.random should NOT be called
                expect(randomCalled).toBe(false);

                // 2. Format should be a valid UUID v4
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                expect(uuidRegex.test(id)).toBe(true);

            } finally {
                Math.random = originalRandom;
            }
        });
    });
});
