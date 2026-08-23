import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';

const PASSWORD = 'revision-tracking-pw';

describe('Vault revision tracking (rollback defense)', () => {

    it('fresh vaults start at revision 0', () => {
        const vault = new PasswordVault([], null, true, PASSWORD);
        expect(vault.metadata.revision).toBe(0);
    });

    it('content mutations strictly increase the revision counter', async () => {
        let vault = new PasswordVault([], null, true, PASSWORD);

        [vault] = await vault.addEntry({ title: 'one', password: 'p' });
        expect(vault.metadata.revision).toBe(1);

        const revAfterAdd = vault.metadata.revision;
        const modAfterAdd = vault.metadata.modified;

        [vault] = await vault.updateEntry(vault.entries[0].id, { notes: 'edited' });
        expect(vault.metadata.revision).toBe(revAfterAdd + 1);
        expect(vault.metadata.modified >= modAfterAdd).toBe(true);

        [vault] = await vault.deleteEntry(vault.entries[0].id);
        expect(vault.metadata.revision).toBe(revAfterAdd + 2);
    });

    it('lock() carries the revision forward without bumping it', async () => {
        let vault = new PasswordVault([], null, true, PASSWORD);
        [vault] = await vault.addEntry({ title: 'keep', password: 'p' });

        const locked = vault.lock();

        expect(locked.metadata.revision).toBe(vault.metadata.revision);
        expect(locked.metadata.modified).toBe(vault.metadata.modified);
    });

    it('serialization anchors revision and timestamp exactly (rollback detection)', async () => {
        let vault = new PasswordVault([], null, true, PASSWORD);
        [vault] = await vault.addEntry({ title: 'anchor', password: 'p' });
        [vault] = await vault.addEntry({ title: 'anchor2', password: 'q' });

        const expectedRevision = vault.metadata.revision;
        const expectedModified = vault.metadata.modified;

        const [restored] = PasswordVault.fromJSON(JSON.parse(JSON.stringify(vault.toJSON())));

        expect(restored.metadata.revision).toBe(expectedRevision);
        expect(restored.metadata.modified).toBe(expectedModified);
    });

    it('fromJSON rejects a missing revision counter', () => {
        const doc = {
            metadata: { version: '3.0', created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', kdf: { algo: 'PBKDF2-SHA256', iterations: 100000, salt: 'QQ==', wrapIV: 'QQ==', wrappedSessionKey: 'QQ==' } },
            entries: []
        };
        delete doc.metadata.revision;

        const [vault, err] = PasswordVault.fromJSON(doc);
        expect(vault).toEqual(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase()).toContain('revision');
    });

    it('fromJSON rejects negative or non-integer revisions', () => {
        const baseDoc = () => ({
            metadata: { version: '3.0', revision: 0, created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', kdf: { algo: 'PBKDF2-SHA256', iterations: 100000, salt: 'QQ==', wrapIV: 'QQ==', wrappedSessionKey: 'QQ==' } },
            entries: []
        });

        const negDoc = baseDoc();
        negDoc.metadata.revision = -3;
        const [, negErr] = PasswordVault.fromJSON(negDoc);
        expect(negErr instanceof Error).toBe(true);
        expect(negErr.message.toLowerCase()).toContain('revision');

        const strDoc = baseDoc();
        strDoc.metadata.revision = 'twelve';
        const [, strErr] = PasswordVault.fromJSON(strDoc);
        expect(strErr instanceof Error).toBe(true);
        expect(strErr.message.toLowerCase()).toContain('revision');
    });
});

if (typeof document !== 'undefined') {
    describe('Revision surfaced in UI status line', () => {
        it('updateUI reports Rev N after unlocking a vault with content', async () => {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');

            let vault = new PasswordVault([], null, true, PASSWORD);
            [vault] = await vault.addEntry({ title: 'visible', password: 'p' });

            // The runner's DOM shim returns a fresh stub per getElementById
            // call; override with stable mocks so state persists for asserts.
            const statusEl = { textContent: '', addEventListener: () => {} };
            const elements = {
                'statusText': statusEl,
                'itemCount': { textContent: '', addEventListener: () => {} },
                'vaultList': { querySelectorAll: () => [], addEventListener: () => {}, appendChild: () => {}, innerHTML: '' },
                'tagList': { innerHTML: '', addEventListener: () => {} },
                'importBtn': { style: {}, addEventListener: () => {} },
                'exportBtn': { style: {}, addEventListener: () => {} },
                'searchInput': { value: '', addEventListener: () => {} },
                'sortSelect': { value: 'newest', addEventListener: () => {} }
            };
            const originalGetElementById = document.getElementById;
            document.getElementById = (id) => (id in elements && elements[id]) ? elements[id] : originalGetElementById(id);

            try {
                const ui = new VaultUI();
                ui.vault = vault;

                ui.updateUI();

                expect(/Rev \d+/.test(statusEl.textContent)).toBe(true);
            } finally {
                document.getElementById = originalGetElementById;
            }
        });
    });
} else {
    describe('Revision surfaced in UI status line', () => {
        it('Skipped outside browser-runner DOM shims', () => { expect(true).toBe(true); });
    });
}
