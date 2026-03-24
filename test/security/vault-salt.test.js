import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';

describe('PasswordVault Security Tests', () => {

    it('should generate a unique random salt on instantiation', async () => {
        const vault1 = new PasswordVault();
        const vault2 = new PasswordVault();

        expect(vault1.metadata.salt).toBeDefined();
        expect(vault2.metadata.salt).toBeDefined();

        expect(vault1.metadata.salt.length).toEqual(16);
        expect(vault2.metadata.salt.length).toEqual(16);

        // Prove salts are not hardcoded but generated randomly
        const salt1Hex = Array.from(vault1.metadata.salt).map(b => b.toString(16).padStart(2, '0')).join('');
        const salt2Hex = Array.from(vault2.metadata.salt).map(b => b.toString(16).padStart(2, '0')).join('');

        expect(salt1Hex).not.toEqual(salt2Hex);
    });

    it('should retain provided metadata and salt if instantiated with it', async () => {
        const dummySalt = Array.from(new Uint8Array(16).fill(42));
        const vault = new PasswordVault([], { salt: dummySalt, version: '2.0' });

        expect(vault.metadata.salt).toEqual(dummySalt);
    });

    it('should generate unique, UUID-based IDs', async () => {
        const id1 = PasswordVault.generateId();
        const id2 = PasswordVault.generateId();

        expect(id1).not.toEqual(id2);

        // UUIDs should have enough entropy (length typically 36 + prefix)
        expect(id1.length > 30).toEqual(true);
    });

    it('should result in different session keys for different vaults with same password', async () => {
        // Vaults initialized with same entries and same master password
        const vault1 = new PasswordVault([], null, true, 'test-password');
        const vault2 = new PasswordVault([], null, true, 'test-password');

        // Vaults should have uniquely generated salts internally
        const [key1] = await vault1._getSessionKey();
        const [key2] = await vault2._getSessionKey();

        expect(key1).toBeDefined();
        expect(key2).toBeDefined();

        // Export keys to compare their raw bytes
        const exported1 = await cryptoInstance.subtle.exportKey('raw', key1);
        const exported2 = await cryptoInstance.subtle.exportKey('raw', key2);

        const key1Hex = Array.from(new Uint8Array(exported1)).map(b => b.toString(16).padStart(2, '0')).join('');
        const key2Hex = Array.from(new Uint8Array(exported2)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Prevent dictionary attacks by ensuring keys are different
        expect(key1Hex).not.toEqual(key2Hex);
    });
});
