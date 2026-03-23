import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('ID Generation Security Tests', () => {
    it('PasswordVault should not use Math.random() for ID generation', () => {
        const originalRandom = Math.random;
        Math.random = () => 0.123456789;

        try {
            const id = PasswordVault.generateId();
            const predictablePart = (0.123456789).toString(36).substring(2, 11);
            expect(id.includes(predictablePart)).toBe(false);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('ChunkManager should not use Math.random() for ID generation', () => {
        const originalRandom = Math.random;
        Math.random = () => 0.123456789; // Predictable return value

        try {
            const id = ChunkManager.generateId();
            // If Math.random is used to generate hex, 0.123456789 * 16 | 0 = 1
            // A UUID completely generated with this would be:
            // "11111111-1111-4111-9111-111111111111"
            expect(id).not.toBe('11111111-1111-4111-9111-111111111111');
        } finally {
            Math.random = originalRandom;
        }
    });
});
