import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';

const PASSWORD = 'export-roundtrip-pw';

async function makeVault() {
    let vault = new PasswordVault([], null, true, PASSWORD);
    [vault] = await vault.addEntry({ title: 'bank', username: 'u1', password: 'alpha-secret', tags: ['finance'] });
    [vault] = await vault.addEntry({ title: 'email', username: 'u2', password: 'beta-secret', notes: 'secondary' });
    return vault;
}

describe('Encrypted export/import envelope', () => {

    it('exports a self-describing envelope without plaintext secrets', async () => {
        const vault = await makeVault();

        const [json, err] = await vault.exportEncrypted(PASSWORD);

        expect(err).toEqual(null);
        expect(typeof json).toBe('string');

        const envelope = JSON.parse(json);
        expect(envelope.format).toBe('ollie-export');
        expect(envelope.version).toBe(1);
        expect(typeof envelope.kdf.salt).toBe('string');
        expect(typeof envelope.kdf.iv).toBe('string');
        expect(typeof envelope.kdf.ciphertext).toBe('string');
        expect(Number.isInteger(envelope.kdf.iterations)).toBe(true);
        expect(json.includes('alpha-secret')).toBe(false);
        expect(json.includes('bank')).toBe(false);
    });

    it('defaults to the vault credential when no password is passed', async () => {
        const vault = await makeVault();
        const [, err] = await vault.exportEncrypted();
        expect(err).toEqual(null);
    });

    it('refuses export on a locked or credential-less vault', async () => {
        const vault = await makeVault();
        const locked = vault.lock();

        const [json, err] = await locked.exportEncrypted(PASSWORD);
        expect(json).toEqual(null);
        expect(err instanceof Error).toBe(true);
    });

    it('roundtrips entries and revision through import', async () => {
        const vault = await makeVault();
        const [json] = await vault.exportEncrypted(PASSWORD);

        const [restored, importErr] = await PasswordVault.importEncrypted(json, PASSWORD);
        expect(importErr).toEqual(null);
        expect(restored.entries.length).toBe(2);
        expect(restored.metadata.revision).toBe(vault.metadata.revision);

        const [plaintext, decErr] = await restored.getPlaintextJSON();
        expect(decErr).toEqual(null);
        const data = JSON.parse(plaintext);
        expect(data.entries[0].password).toBe('alpha-secret');
        expect(data.entries[1].title).toBe('email');
    });

    it('rejects the wrong password with a typed error', async () => {
        const vault = await makeVault();
        const [json] = await vault.exportEncrypted(PASSWORD);

        const [restored, err] = await PasswordVault.importEncrypted(json, 'not-my-password');
        expect(restored).toEqual(null);
        expect(err instanceof Error).toBe(true);
    });

    it('rejects tampered ciphertext instead of returning garbage', async () => {
        const vault = await makeVault();
        const [json] = await vault.exportEncrypted(PASSWORD);

        const envelope = JSON.parse(json);
        const bin = atob(envelope.kdf.ciphertext);
        const idx = Math.floor(bin.length / 2);
        envelope.kdf.ciphertext = btoa(bin.slice(0, idx) + String.fromCharCode(bin.charCodeAt(idx) ^ 0x40) + bin.slice(idx + 1));

        const [restored, err] = await PasswordVault.importEncrypted(JSON.stringify(envelope), PASSWORD);
        expect(restored).toEqual(null);
        expect(err instanceof Error).toBe(true);
    });

    it('rejects malformed envelopes with a typed error naming the problem', async () => {
        const [r1, e1] = await PasswordVault.importEncrypted('{}', PASSWORD);
        expect(r1).toEqual(null);
        expect(e1.message.toLowerCase()).toContain('envelope');

        const [r2, e2] = await PasswordVault.importEncrypted('not json at all', PASSWORD);
        expect(r2).toEqual(null);
        expect(e2 instanceof Error).toBe(true);
    });
});
