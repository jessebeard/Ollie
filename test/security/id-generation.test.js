import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Secure ID Generation', () => {
    it('should generate secure UUIDs without Math.random for ChunkManager', async () => {
        const mathRandomSpy = Math.random;
        let called = false;
        Math.random = () => { called = true; return 0.5; };

        try {
            const id = ChunkManager.generateId();
            expect(called).toBe(false);

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = mathRandomSpy;
        }
    });

    it('should generate secure UUIDs without Math.random for PasswordVault', async () => {
        const mathRandomSpy = Math.random;
        let called = false;
        Math.random = () => { called = true; return 0.5; };

        try {
            const id = PasswordVault.generateId();
            expect(called).toBe(false);

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(id)).toBe(true);
        } finally {
            Math.random = mathRandomSpy;
        }
    });
});
