import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/core/vault/vault-manager.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('PasswordVault (Property-Based Tests)', () => {

    it('Property: Idempotent Serialization (toJSON -> fromJSON yields equivalent data)', async () => {
        const arbEntry = () => ({
            title: Arbitrary.string(1, 50).generate(),
            url: Arbitrary.string(5, 100).generate(),
            username: Arbitrary.string(1, 30).generate(),
            password: Arbitrary.string(8, 64).generate(),
            notes: Arbitrary.string(0, 500).generate(),
            tags: Arbitrary.array(Arbitrary.string(1, 10), 0, 5).generate(),
            totp: Arbitrary.string(16, 16).generate(),
            customFields: Arbitrary.array({
                generate: () => ({
                    label: Arbitrary.string(1, 20).generate(),
                    value: Arbitrary.string(1, 50).generate()
                }),
                shrink: () => []
            }, 0, 3).generate()
        });

        await assertProperty(
            [Arbitrary.array(arbEntry, 1, 50), Arbitrary.string(8, 32)],
            async (randomEntries, masterPass) => {
                let vault = new PasswordVault([], null, true, masterPass);

                for (let i = 0; i < randomEntries.length; i++) {
                    const oldLength = vault.entries.length;

                    const [newVault, error] = await vault.addEntry(randomEntries[i]);

                    expect(error).toEqual(null);
                    expect(newVault).not.toBe(vault);
                    expect(newVault.entries.length).toBe(oldLength + 1);
                    expect(vault.entries.length).toBe(oldLength);

                    vault = newVault;
                }

                // Verify serialization handles `_encrypted` properties properly
                const serialized = vault.toJSON();
                const [restoredVault, restoreErr] = PasswordVault.fromJSON(serialized, true, masterPass, vault.sessionKey);

                expect(restoreErr).toEqual(null);
                expect(restoredVault.entries.length).toBe(vault.entries.length);

                // Deep equality verification - must decrypt to check sensitive fields
                const [plaintextJsonStr, pErr] = await restoredVault.getPlaintextJSON();
                expect(pErr).toEqual(null);

                const plaintextData = JSON.parse(plaintextJsonStr);
                const pEntries = plaintextData.entries;

                for (let i = 0; i < randomEntries.length; i++) {
                    const orig = randomEntries[i];
                    const restored = pEntries[i];

                    expect(orig.title).toBe(restored.title);
                    expect(orig.password).toBe(restored.password);
                    if (orig.tags) expect(orig.tags.length).toBe(restored.tags.length);
                }

                return true;
            },
            20
        );
    });

    it('Property: Deterministic Locking (lock always destroys keys and sets strict state)', async () => {
        await assertProperty(
            [Arbitrary.string(8, 64)],
            async (masterPassword) => {
                // Mock a session key
                const sessionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
                const vault = new PasswordVault([], null, true, masterPassword, sessionKey);

                const lockedVault = vault.lock();

                expect(vault.isUnlocked).toBe(true);
                expect(vault.masterPassword).toBe(masterPassword);
                expect(vault.sessionKey !== null).toBe(true);

                expect(lockedVault).not.toBe(vault);
                expect(lockedVault.isUnlocked).toBe(false);
                expect(lockedVault.masterPassword).toBe(null);
                expect(lockedVault.sessionKey).toBe(null);

                return true;
            },
            25
        );
    });

    it('Property: Rejection of Operations when Locked', async () => {
        const vault = new PasswordVault(); // Default is locked

        const [v1, err1] = await vault.addEntry({ title: 'Test' });
        expect(err1 !== null).toBe(true);

        const [v2, err2] = await vault.updateEntry('some-id', { title: 'New' });
        expect(err2 !== null).toBe(true);

        const [pJson, pErr] = await vault.getPlaintextJSON();
        expect(pErr !== null).toBe(true);
    });

    it('should calculate unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(PasswordVault.generateId());
        }
        expect(ids.size).toBe(100);
    });

    it('should search entries correctly skipping encrypted fields', async () => {
        let vault = new PasswordVault([], null, true, 'masterpass123');

        [vault] = await vault.addEntry({ title: 'Apple ID', url: 'apple.com', tags: ['personal', 'apple'] });
        [vault] = await vault.addEntry({ title: 'Work Email', url: 'gmail.com', tags: ['work', 'email'] });
        [vault] = await vault.addEntry({ title: 'Personal Email', username: 'jesse', tags: ['personal', 'email'] });
        [vault] = await vault.addEntry({ title: 'Banking', tags: ['finance'], notes: 'Hidden secret notes' });

        expect(vault.search('', []).length).toBe(4);

        // Text query matches public fields
        expect(vault.search('email', []).length).toBe(2);

        // Ensure "Hidden secret notes" cannot be found by plain text search since it is encrypted
        expect(vault.search('Hidden secret', []).length).toBe(0);

        // Tag matching
        expect(vault.search('', ['personal']).length).toBe(2);
        expect(vault.search('', ['personal', 'email']).length).toBe(1);
    });
});
