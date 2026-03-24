import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { generateSecureId } from '../../src/information-theory/cryptography/crypto-compat.js';

describe('Security: Secure Randomness in Vaults and IDs', () => {

    it('should generate distinct session salts for distinct vaults', () => {
        const vault1 = new PasswordVault();
        const vault2 = new PasswordVault();

        expect(vault1.metadata.sessionSalt !== undefined).toBe(true);
        expect(vault2.metadata.sessionSalt !== undefined).toBe(true);

        const salt1Hex = Array.from(vault1.metadata.sessionSalt).map(b => b.toString(16).padStart(2, '0')).join('');
        const salt2Hex = Array.from(vault2.metadata.sessionSalt).map(b => b.toString(16).padStart(2, '0')).join('');

        expect(salt1Hex).not.toBe(salt2Hex);
        expect(salt1Hex.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should not use Math.random for generating IDs', () => {
        const originalRandom = Math.random;
        let mathRandomCalled = false;

        Math.random = () => {
            mathRandomCalled = true;
            return 0.5;
        };

        try {
            const vaultId = PasswordVault.generateId();
            const chunkId = ChunkManager.generateId();
            const directId = generateSecureId();

            expect(mathRandomCalled).toBe(false);

            // Verify they look like valid IDs
            expect(typeof vaultId).toBe('string');
            expect(typeof chunkId).toBe('string');
            expect(typeof directId).toBe('string');

            // vault generates prefixed id
            expect(vaultId.includes('-')).toBe(true);
        } finally {
            Math.random = originalRandom;
        }
    });

    it('should fall back if crypto is not available (test branch)', () => {
        // We'll test the actual generated values instead of mocking cryptoInstance
        // as ES modules make mocking the exported cryptoInstance difficult.
        const id1 = generateSecureId(true);
        const id2 = generateSecureId(false);

        expect(id1).not.toBe(id2);
        expect(typeof id1).toBe('string');
        expect(typeof id2).toBe('string');
    });

    it('should maintain backward compatibility with legacy vaults lacking sessionSalt', async () => {
        const legacyVaultData = {
            metadata: {
                version: '2.0',
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            },
            entries: []
        };

        const [restoredVault, err] = PasswordVault.fromJSON(legacyVaultData, true, 'password123');
        expect(err).toBe(null);

        // It should NOT assign a new sessionSalt to old data
        expect(restoredVault.metadata.sessionSalt).toBe(undefined);

        // It should derive session key correctly (mocking test of logic, no error thrown)
        const [sessionKey, sessionErr] = await restoredVault._getSessionKey();
        expect(sessionErr).toBe(null);
        expect(sessionKey).not.toBe(null);
    });

});
