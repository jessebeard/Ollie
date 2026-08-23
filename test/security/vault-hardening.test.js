import { describe, it, expect } from '../utils/test-runner.js';
import { SecureEntry } from '../../src/structures/vault/secure-record.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { KeyDerivation } from '../../src/information-theory/cryptography/pbkdf2.js';
import { Encryption } from '../../src/information-theory/cryptography/aes-gcm.js';

const PASSWORD = 'wave-d-test-password';

async function makeUnlockedVaultWithEntry(title) {
    const vault = new PasswordVault([], null, true, PASSWORD);
    const [next] = await vault.addEntry({
        title,
        username: 'user',
        password: 'p'.repeat(64),
        notes: ''
    });
    return [next, next.entries[0]];
}

describe('SecureEntry serialization hardening', () => {

    it('serializes encrypted fields as base64 strings, not number arrays', async () => {
        const [, entry] = await makeUnlockedVaultWithEntry('b64');
        const json = entry.toJSON();

        expect(typeof json._encrypted.ciphertext).toBe('string');
        expect(typeof json._encrypted.iv).toBe('string');
    });

    it('base64 form is substantially smaller than the legacy array form', async () => {
        const [, entry] = await makeUnlockedVaultWithEntry('size');

        const b64Form = JSON.stringify(entry.toJSON()._encrypted);
        const legacyArrayForm = JSON.stringify({
            ciphertext: Array.from(entry._encrypted.ciphertext),
            iv: Array.from(entry._encrypted.iv)
        });

        expect(b64Form.length).toBeLessThan(legacyArrayForm.length / 2);
    });

    it('roundtrips through base64 without loss', async () => {
        const [vault, entry] = await makeUnlockedVaultWithEntry('roundtrip');
        const [sessionKey] = await vault._getSessionKey();

        const [revived, reviveErr] = SecureEntry.fromJSON(JSON.parse(JSON.stringify(entry.toJSON())));
        expect(reviveErr).toEqual(null);

        const [plaintext, err] = await revived.decrypt(sessionKey);

        expect(err).toEqual(null);
        expect(plaintext.title).toBe('roundtrip');
        expect(plaintext.password).toBe('p'.repeat(64));
    });

    it('fromJSON returns a typed error for malformed records instead of constructing broken entries', () => {
        const malformed = {
            id: 'x',
            title: 't',
            url: 'https://example.invalid',
            username: 'u',
            created: '2026-01-01T00:00:00.000Z',
            modified: '2026-01-01T00:00:00.000Z',
            tags: [],
            _encrypted: { ciphertext: 5 }
        };

        const [result, err] = SecureEntry.fromJSON(malformed);

        expect(result).toEqual(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase()).toContain('_encrypted');
    });
});

describe('updateEntry input validation', () => {

    it('addEntry requires a non-empty string title', async () => {
        const vault = new PasswordVault([], null, true, PASSWORD);

        const [updated, err] = await vault.addEntry({ username: 'u' });

        expect(updated).toEqual(vault);
        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase()).toContain('title');
    });

    it('addEntry rejects non-string secret fields', async () => {
        const vault = new PasswordVault([], null, true, PASSWORD);

        const [, err] = await vault.addEntry({ title: 't', password: 42 });

        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase()).toContain('password');
    });

    it('rejects non-array tags instead of silently discarding them', async () => {
        let vault = new PasswordVault([], null, true, PASSWORD);
        [vault] = await vault.addEntry({ title: 't1', tags: ['orig'] });

        const [updated, err] = await vault.updateEntry(vault.entries[0].id, { tags: 'work, email' });

        expect(updated).toEqual(vault);
        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase()).toContain('tags');
    });

    it('rejects non-array customFields instead of silently discarding them', async () => {
        let vault = new PasswordVault([], null, true, PASSWORD);
        [vault] = await vault.addEntry({ title: 't2' });

        const [, err] = await vault.updateEntry(vault.entries[0].id, { customFields: 'bogus' });

        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase()).toContain('customfields');
    });
});

describe('Master password containment', () => {

    it('unlocked vaults never expose the password through enumeration or serialization', async () => {
        const [vault] = await makeUnlockedVaultWithEntry('containment');

        expect(Object.keys(vault)).not.toContain('masterPassword');
        expect(JSON.stringify(vault).includes(PASSWORD)).toBe(false);
    });

    it('still resolves the session key through the contained credential', async () => {
        const [vault] = await makeUnlockedVaultWithEntry('resolve');

        const [sessionKey, err] = await vault._getSessionKey();
        expect(err).toEqual(null);
        expect(sessionKey).not.toEqual(null);
    });

    it('lock() drops both the credential and all stored entries', async () => {
        const [vault] = await makeUnlockedVaultWithEntry('lockdrop');
        const locked = vault.lock();

        expect(locked.entries.length).toBe(0);
        expect(locked.isUnlocked).toBe(false);
    });
});

describe('AES-GCM binding hygiene', () => {

    it('derives non-extractable keys from PBKDF2', async () => {
        const [, saltErr] = [null, null];
        const [salt] = KeyDerivation.generateSalt();
        const [key] = await KeyDerivation.deriveKey(PASSWORD, salt);

        expect(key.extractable).toBe(false);
    });

    it('rejects ciphertext transplanted onto a different entry identity', async () => {
        const [vaultA, entryA] = await makeUnlockedVaultWithEntry('victim');
        const [sessionKey] = await vaultA._getSessionKey();

        const stolen = {
            ciphertext: entryA._encrypted.ciphertext,
            iv: entryA._encrypted.iv
        };
        const impostorRecord = { ...JSON.parse(JSON.stringify(entryA.toJSON())), id: 'impostor-id' };
        impostorRecord._encrypted = {
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(stolen.ciphertext))),
            iv: btoa(String.fromCharCode(...stolen.iv))
        };
        const [impostor] = SecureEntry.fromJSON(impostorRecord);

        const [, decErr] = await impostor.decrypt(sessionKey);
        expect(decErr instanceof Error).toBe(true);
    });
});
