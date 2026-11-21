import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('Vault Dedicated PBT Suite', () => {
    it('Property: Vault serialization roundtrip preserves entries and fields exactly', async () => {
        await assertProperty(
            [Arbitrary.string(8, 24), Arbitrary.string(1, 20), Arbitrary.string(1, 20), Arbitrary.string(8, 24)],
            async (masterPass, title, username, password) => {
                const vault = new PasswordVault([], null, true, masterPass);
                const [vWithEntry, addErr] = await vault.addEntry({
                    title,
                    username,
                    password
                });
                expect(addErr).toBe(null);

                const serialized = vWithEntry.toJSON();
                expect(typeof serialized).toBe('object');

                const [sessionKey] = await vWithEntry._getSessionKey();
                const [recovered, loadErr] = PasswordVault.fromJSON(serialized, true, masterPass, sessionKey);
                expect(loadErr).toBe(null);
                expect(recovered.isUnlocked).toBe(true);

                const [plainJson] = await recovered.getPlaintextJSON();
                const data = JSON.parse(plainJson);
                expect(data.entries.length).toBe(1);
                expect(data.entries[0].title).toBe(title);
                expect(data.entries[0].username).toBe(username);
                // Verify encrypted payload was preserved and decrypted accurately
                expect(data.entries[0].password).toBe(password);
            },
            25
        );
    });

    it('Property: Mutating vault operations strictly increment revision counter monotonically', async () => {
        await assertProperty(
            [Arbitrary.string(8, 24)],
            async (masterPass) => {
                const vault = new PasswordVault([], null, true, masterPass);
                const r0 = vault.metadata.revision;

                const [v1] = await vault.addEntry({ title: 'T1', password: 'P1' });
                expect(v1.metadata.revision).toBeGreaterThan(r0);

                const [v2] = await v1.addEntry({ title: 'T2', password: 'P2' });
                expect(v2.metadata.revision).toBeGreaterThan(v1.metadata.revision);

                const [v3] = await v2.updateEntry(v2.entries[0].id, { title: 'T1-Updated' });
                expect(v3.metadata.revision).toBeGreaterThan(v2.metadata.revision);

                const [v4] = await v3.deleteEntry(v3.entries[1].id);
                expect(v4.metadata.revision).toBeGreaterThan(v3.metadata.revision);
            },
            25
        );
    });

    it('Property: Locking a vault destroys decrypted secrets and rejects getPlaintextJSON / mutations', async () => {
        await assertProperty(
            [Arbitrary.string(8, 24), Arbitrary.string(1, 20)],
            async (masterPass, title) => {
                const vault = new PasswordVault([], null, true, masterPass);
                const [unlocked] = await vault.addEntry({ title, password: 'P' });

                const locked = unlocked.lock();
                expect(locked.isUnlocked).toBe(false);
                expect(locked.entries.length).toBe(0);
                expect(locked._sessionKey()).toBe(null);

                // Methods on locked vault must fail closed
                const [plain, plainErr] = await locked.getPlaintextJSON();
                expect(plain).toBe(null);
                expect(plainErr instanceof Error).toBe(true);

                const [, addErr] = await locked.addEntry({ title: 'X', password: 'Y' });
                expect(addErr instanceof Error).toBe(true);
            },
            25
        );
    });
});
