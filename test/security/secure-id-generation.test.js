import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

function expectToMatchRegex(actual, regex, message) {
    if (!regex.test(actual)) {
        throw new Error(message || `Expected "${actual}" to match regex ${regex}`);
    }
}

describe('Security: Cryptographically Secure ID Generation', () => {
    it('ChunkManager.generateId should use secure randomUUID and not Math.random', () => {
        let mathRandomCalled = false;
        const originalRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return originalRandom();
        };

        const id = ChunkManager.generateId();

        Math.random = originalRandom;

        expect(mathRandomCalled).toBe(false, 'Math.random should not be called');

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expectToMatchRegex(id, uuidRegex, 'Generated ID must be a valid UUID v4');
    });

    it('PasswordVault.generateId should use secure randomUUID and not Math.random', () => {
        let mathRandomCalled = false;
        const originalRandom = Math.random;
        Math.random = () => {
            mathRandomCalled = true;
            return originalRandom();
        };

        const id = PasswordVault.generateId();

        Math.random = originalRandom;

        expect(mathRandomCalled).toBe(false, 'Math.random should not be called');

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expectToMatchRegex(id, uuidRegex, 'Generated ID must be a valid UUID v4');
    });
});
