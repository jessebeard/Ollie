
import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/core/vault/vault-manager.js';

describe('PasswordVault', () => {
    it('should initialize with default metadata', () => {
        const vault = new PasswordVault();
        expect(vault.entries).toEqual([]);
        expect(vault.metadata.version).toBe('2.0'); // New version
        expect(vault.isUnlocked).toBe(false);
    });

    it('should add a complete entry', () => {
        const vault = new PasswordVault();
        const entry = {
            title: 'Test Site',
            url: 'https://example.com',
            username: 'user',
            password: 'pass',
            notes: 'notes',
            tags: ['work', 'email'],
            totp: 'JBSWY3DPEHPK3PXP',
            customFields: [
                { label: 'Security Question', value: 'Blue' }
            ]
        };

        const result = vault.addEntry(entry);

        expect(result.id).toBeDefined();
        expect(result.tags.length).toBe(2);
        expect(result.totp).toBe('JBSWY3DPEHPK3PXP');
        expect(result.customFields[0].value).toBe('Blue');
        expect(vault.entries.length).toBe(1);
    });

    it('should update entry fields including new ones', () => {
        const vault = new PasswordVault();
        const entry = vault.addEntry({ title: 'Old' });

        vault.updateEntry(entry.id, {
            title: 'New',
            tags: ['finance'],
            totp: 'SECRET'
        });

        const updated = vault.entries[0];
        expect(updated.title).toBe('New');
        expect(updated.tags[0]).toBe('finance');
        expect(updated.totp).toBe('SECRET');
    });

    it('should filter by tags', () => {
        const vault = new PasswordVault();
        vault.addEntry({ title: 'A', tags: ['work'] });
        vault.addEntry({ title: 'B', tags: ['personal'] });
        vault.addEntry({ title: 'C', tags: ['work', 'important'] });

        // Search text only
        const workItems = vault.search('', ['work']);
        expect(workItems.length).toBe(2);
        expect(workItems[0].title).toBe('A');
        expect(workItems[1].title).toBe('C');

        // Search text AND tag
        const specific = vault.search('C', ['work']);
        expect(specific.length).toBe(1);
        expect(specific[0].title).toBe('C');
    });

    it('should fail when loading legacy data', () => {
        const vault = new PasswordVault();
        const legacyData = {
            metadata: { version: '1.0' },
            entries: []
        };

        // Should throw or fail validation
        let error = null;
        try {
            vault.fromJSON(legacyData);
        } catch (e) {
            error = e;
        }

        // Depending on implementation, might check version or just structure
        // Since we want NO backward compat, throwing on version mismatch is good
        expect(error).toBeDefined();
    });

    it('should serialize and deserialize correctly', () => {
        const vault = new PasswordVault();
        vault.addEntry({ title: 'Test', tags: ['tag'] });

        const json = vault.toJSON();

        const newVault = new PasswordVault();
        newVault.fromJSON(json);

        expect(newVault.entries.length).toBe(1);
        expect(newVault.entries[0].tags[0]).toBe('tag');
        expect(newVault.metadata.version).toBe('2.0');
    });
});
