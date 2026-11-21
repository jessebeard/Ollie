import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';

const PASSWORD = 'correct-horse-battery';

function makeEntry(title) {
    return { title, username: 'u1', password: 'p-' + title, notes: '' };
}

describe('Vault Key-Wrapping v3', () => {

    it('records a KDF wrap block with random per-vault salt', async () => {
        let v1 = new PasswordVault([], null, true, PASSWORD);
        let v2 = new PasswordVault([], null, true, PASSWORD);
        [v1] = await v1.addEntry(makeEntry('a'));
        [v2] = await v2.addEntry(makeEntry('a'));

        const k1 = v1.metadata.kdf;
        const k2 = v2.metadata.kdf;

        expect(k1).not.toEqual(null);
        expect(k2).not.toEqual(null);
        expect(k1.algo).toBe('PBKDF2-SHA256');
        expect(k1.iterations).toBeGreaterThan(0);
        expect(k1.salt).not.toBe(k2.salt);
        expect(k1.wrappedSessionKey).not.toEqual(null);
        expect(k1.wrapIV).not.toEqual(null);
    });

    it('produces distinct entry ciphertexts across vaults sharing one password', async () => {
        let v1 = new PasswordVault([], null, true, PASSWORD);
        let v2 = new PasswordVault([], null, true, PASSWORD);
        [v1] = await v1.addEntry(makeEntry('same-title'));
        [v2] = await v2.addEntry(makeEntry('same-title'));

        const c1 = Array.from(v1.entries[0]._encrypted.ciphertext);
        const c2 = Array.from(v2.entries[0]._encrypted.ciphertext);

        expect(c1.length).toBe(c2.length);
        const identical = c1.every((b, i) => b === c2[i]);
        expect(identical).toBe(false);
    });

    it('serializes the wrap block and version into the vault document', async () => {
        let vault = new PasswordVault([], null, true, PASSWORD);
        [vault] = await vault.addEntry(makeEntry('roundtrip'));

        const json = JSON.stringify(vault.toJSON());

        expect(json.includes('"kdf"')).toBe(true);

        const parsed = JSON.parse(json);
        expect(parsed.metadata.version).toBe('3.0');
        expect(typeof parsed.metadata.kdf.salt).toBe('string');
        expect(typeof parsed.metadata.kdf.wrapIV).toBe('string');
        expect(typeof parsed.metadata.kdf.wrappedSessionKey).toBe('string');
    });
});
