import { describe, it, expect } from '../../utils/test-runner.js';

/**
 * importData() must route by content: JSON envelopes keep the legacy parse,
 * CSV exports delegate to structures/vault/csv-import.js and reuse the same
 * merge-and-report loop.
 */

if (typeof document !== 'undefined') {
    describe('Import routing in vault UI', () => {
        async function runImport(fileStub) {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');

            const added = [];
            const alerts = [];
            const fakeVault = {
                isUnlocked: true,
                addEntry: async (entry) => {
                    added.push(entry);
                    return [fakeVault, null];
                }
            };

            let capturedInput = null;
            const originalCreate = document.createElement;
            const originalGet = document.getElementById;
            document.createElement = (tag) => {
                if (tag === 'input') {
                    capturedInput = {
                        type: '', accept: '', onchange: null,
                        click() { setTimeout(() => this.onchange({ target: { files: [fileStub] } }), 0); }
                    };
                    return capturedInput;
                }
                return originalCreate(tag);
            };
            document.getElementById = (id) => ({ style: {}, addEventListener: () => {}, textContent: '' , innerHTML: ''});

            try {
                const ui = new VaultUI();
                ui.modals = {
                    showAlert: async (title, msg) => alerts.push(title + ': ' + msg),
                    prompt: async () => 'unused',
                    confirm: async () => true
                };
                ui.showLoading = () => {};
                ui.updateUI = () => {};
                ui.vault = fakeVault;

                ui.importData();
                await new Promise(r => setTimeout(r, 10));
                return { added, alerts };
            } finally {
                document.createElement = originalCreate;
                document.getElementById = originalGet;
            }
        }

        it('routes CSV exports through the vendor importer', async () => {
            const csv = [
                '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"',
                '"https://example.com/","u@x.com","pw","realm","","g1","","",""',
                '"https://test.org/","u2","pw2","","","g2","","",""'
            ].join('\r\n');

            const { added, alerts } = await runImport({
                name: 'logins.csv',
                text: async () => csv
            });

            expect(added.length).toBe(2);
            expect(added[0].title).toBe('example.com');
            expect(alerts.some(a => a.includes('Import Complete') && a.includes('2'))).toBe(true);
        });

        it('keeps parsing legacy JSON envelopes unchanged', async () => {
            const json = JSON.stringify({ entries: [{ title: 'FromJSON', password: 'p' }] });
            const { added } = await runImport({
                name: 'export.json',
                text: async () => json
            });

            expect(added.length).toBe(1);
            expect(added[0].title).toBe('FromJSON');
        });
    });
} else {
    describe('Import routing in vault UI', () => {
        it('Skipped outside Node-runner DOM shims', () => { expect(true).toBe(true); });
    });
}
