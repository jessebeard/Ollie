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

        // Wire format must be a compact positional tuple per Rule 16
        const tuple = JSON.parse(json);
        expect(Array.isArray(tuple)).toBe(true);
        expect(tuple.length).toBe(4);
        expect(tuple[0]).toBe('ollie-export');
        expect(tuple[1]).toBe(2);
        expect(Array.isArray(tuple[2])).toBe(true);
        expect(tuple[2].length).toBe(4);
        expect(typeof tuple[3]).toBe('string');

        // Schema unpacker parses tuple into normalized record
        const [envelope, unpackErr] = PasswordVault.unpackExportEnvelope(json);
        expect(unpackErr).toBe(null);
        expect(envelope.format).toBe('ollie-export');
        expect(envelope.version).toBe(2);
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

        const tuple = JSON.parse(json);
        const bin = atob(tuple[3]);
        const idx = Math.floor(bin.length / 2);
        tuple[3] = btoa(bin.slice(0, idx) + String.fromCharCode(bin.charCodeAt(idx) ^ 0x40) + bin.slice(idx + 1));

        const [restored, err] = await PasswordVault.importEncrypted(JSON.stringify(tuple), PASSWORD);
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

        const [r3, e3] = await PasswordVault.importEncrypted(JSON.stringify(['ollie-export', 2, ['PBKDF2-SHA256']]), PASSWORD);
        expect(r3).toEqual(null);
        expect(e3.message.toLowerCase()).toContain('tuple length');
    });

    it('imports legacy Format v1 dictionary envelopes (backward compatibility)', async () => {
        // Construct a valid v1 dictionary envelope
        const vault = await makeVault();
        const [, kdfBlock] = await vault._resolveSessionKey();
        const doc = {
            metadata: { ...vault.metadata, ...(kdfBlock ? { kdf: kdfBlock } : {}) },
            entries: vault.entries.map(e => e.toJSON())
        };
        const { utf8ToBytes, bytesToBase64 } = await import('../../../src/utils/encoding.js');
        const { KeyDerivation } = await import('../../../src/information-theory/cryptography/pbkdf2.js');
        const { Encryption } = await import('../../../src/information-theory/cryptography/aes-gcm.js');

        const docBytes = utf8ToBytes(JSON.stringify(doc));
        const [salt] = await KeyDerivation.generateSalt();
        const [key] = await KeyDerivation.deriveKey(PASSWORD, salt);
        const bindingData = utf8ToBytes('ollie-export/v1');
        const [enc] = await Encryption.encrypt(docBytes, key, { additionalData: bindingData });

        const legacyEnvelope = {
            format: 'ollie-export',
            version: 1,
            kdf: {
                algo: 'PBKDF2-SHA256',
                iterations: KeyDerivation.ITERATIONS,
                salt: bytesToBase64(salt),
                iv: bytesToBase64(enc.iv),
                ciphertext: bytesToBase64(new Uint8Array(enc.ciphertext))
            }
        };

        const [restored, importErr] = await PasswordVault.importEncrypted(JSON.stringify(legacyEnvelope), PASSWORD);
        expect(importErr).toBe(null);
        expect(restored.entries.length).toBe(2);

        const [plaintext] = await restored.getPlaintextJSON();
        const data = JSON.parse(plaintext);
        expect(data.entries[0].password).toBe('alpha-secret');
    });
});
