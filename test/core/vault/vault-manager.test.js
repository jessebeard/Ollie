import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/core/vault/vault-manager.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('PasswordVault (Property-Based Tests)', () => {

    it('Property: Idempotent Serialization (toJSON -> fromJSON yields equivalent data)', async () => {
        // Fuzz entry generation
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
            [Arbitrary.array(arbEntry, 1, 50)],
            async (randomEntries) => {
                let vault = new PasswordVault();

                // 1. Immutability & Accumulation Property
                for (let i = 0; i < randomEntries.length; i++) {
                    const oldLength = vault.entries.length;
                    const [newVault, error] = vault.addEntry(randomEntries[i]);

                    expect(error).toEqual(null);
                    expect(newVault).not.toBe(vault); // Must return new instance
                    expect(newVault.entries.length).toBe(oldLength + 1); // Must strictly append 1
                    expect(vault.entries.length).toBe(oldLength); // Original must strictly remain unchanged

                    vault = newVault;
                }

                // 2. Serialization Idempotency Property
                const serialized = vault.toJSON();
                const [restoredVault, restoreErr] = PasswordVault.fromJSON(serialized);

                expect(restoreErr).toEqual(null);
                expect(restoredVault.entries.length).toBe(vault.entries.length);

                // Deep equality verification
                for (let i = 0; i < vault.entries.length; i++) {
                    const orig = vault.entries[i];
                    const restored = restoredVault.entries[i];

                    expect(orig.id).toBe(restored.id);
                    expect(orig.title).toBe(restored.title);
                    expect(orig.password).toBe(restored.password);
                    expect(orig.tags.length).toBe(restored.tags.length);
                }

                return true;
            },
            25 // Run 25 test fuzzes (each generating up to 50 items = up to 1250 total vault modifications)
        );
    });

    it('Property: Deterministic Locking (lock always destroys key and sets strict state)', async () => {
        await assertProperty(
            [Arbitrary.string(8, 64)],
            async (masterPassword) => {
                const vault = new PasswordVault([], null, true, masterPassword);

                // Lock must strictely return a new instance with purged credentials
                const lockedVault = vault.lock();

                expect(vault.isUnlocked).toBe(true);
                expect(vault.masterPassword).toBe(masterPassword);

                expect(lockedVault).not.toBe(vault);
                expect(lockedVault.isUnlocked).toBe(false);
                expect(lockedVault.masterPassword).toBe(null);

                return true;
            },
            50
        );
    });

    it('Property: Rejection of Invalid Schema', async () => {
        const vault = new PasswordVault();

        const [v1, err1] = vault.addEntry(null);
        expect(err1 !== null).toBe(true);

        const [v2, err2] = vault.addEntry('not an object');
        expect(err2 !== null).toBe(true);

        const [v3, err3] = vault.updateEntry('non-existent-id', { title: 'New' });
        expect(err3 !== null).toBe(true);

        const [v4, err4] = vault.deleteEntry('non-existent-id');
        expect(err4 !== null).toBe(true);
    });

    it('should initialize with default metadata', () => {
        const vault = new PasswordVault();
        expect(vault.entries).toEqual([]);
        expect(vault.metadata.version).toBe('2.0');
        expect(vault.isUnlocked).toBe(false);
    });


    it('should return error when deleting non-existent entry', () => {
        const vault = new PasswordVault();
        const [newVault, error] = vault.deleteEntry('non-existent-id');
        expect(error !== null).toBe(true);
    });

    it('should delete an existing entry immutably', () => {
        let vault = new PasswordVault();
        [vault] = vault.addEntry({ title: 'To Delete' });
        expect(vault.entries.length).toBe(1);
        const entryId = vault.entries[0].id;

        const [newVault, error] = vault.deleteEntry(entryId);
        expect(error).toEqual(null);

        expect(vault.entries.length).toBe(1);
        expect(newVault.entries.length).toBe(0);
    });

    it('should generate unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(PasswordVault.generateId());
        }
        expect(ids.size).toBe(100);
    });



    it('should preserve full entry data through toJSON/fromJSON round-trip', () => {
        let vault = new PasswordVault();
        [vault] = vault.addEntry({
            title: 'Full Entry',
            url: 'https://example.com',
            username: 'admin',
            password: 'p@ssw0rd',
            notes: 'Important notes here',
            tags: ['finance', 'critical'],
            totp: 'JBSWY3DPEHPK3PXP',
            customFields: [
                { label: 'Recovery Email', value: 'backup@test.com' },
                { label: 'PIN', value: '1234' }
            ]
        });
        [vault] = vault.addEntry({ title: 'Second Entry', tags: ['personal'] });

        const json = vault.toJSON();
        const [newVault, err] = PasswordVault.fromJSON(json);
        expect(err).toEqual(null);

        expect(newVault.entries.length).toBe(2);
        const e = newVault.entries[0];
        expect(e.title).toBe('Full Entry');
        expect(e.url).toBe('https://example.com');
        expect(e.username).toBe('admin');
        expect(e.password).toBe('p@ssw0rd');
        expect(e.notes).toBe('Important notes here');
        expect(e.tags.length).toBe(2);
        expect(e.totp).toBe('JBSWY3DPEHPK3PXP');
        expect(e.customFields.length).toBe(2);
        expect(e.customFields[1].value).toBe('1234');
    });
});
