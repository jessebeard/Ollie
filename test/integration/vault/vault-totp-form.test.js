import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';

/**
 * The Add/Edit entry forms must expose a TOTP field. Bare Base32 secrets
 * are normalized by the vault layer; the form only needs to pass values
 * through, and surface validation failures instead of encrypting them.
 */

const PASSWORD = 'totp-form-pw';

if (typeof document !== 'undefined') {
    describe('TOTP entry form', () => {
        async function runAddEntry(formValue) {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');

            const alerts = [];
            const vault = new PasswordVault([], null, true, PASSWORD);

            const elements = {
                'statusText': { textContent: '', addEventListener: () => {} },
                'itemCount': { textContent: '', addEventListener: () => {} },
                'vaultList': { querySelectorAll: () => [], addEventListener: () => {}, appendChild: () => {}, innerHTML: '' },
                'tagList': { innerHTML: '', addEventListener: () => {} },
                'importBtn': { style: {}, addEventListener: () => {} },
                'exportBtn': { style: {}, addEventListener: () => {} },
                'searchInput': { value: '', addEventListener: () => {} },
                'sortSelect': { value: 'newest', addEventListener: () => {} }
            };
            const originalGet = document.getElementById;
            const originalCreate = document.createElement;
            document.getElementById = (id) => (id in elements && elements[id]) ? elements[id] : originalGet(id);
            document.createElement = (tag) => (tag === 'input')
                ? { type: '', accept: '', onchange: null }
                : originalCreate(tag);

            try {
                const ui = new VaultUI();
                ui.modals = {
                    showForm: async () => formValue,
                    showAlert: async (title, msg) => alerts.push(title + ': ' + msg),
                    prompt: async () => PASSWORD,
                    confirm: async () => true
                };
                ui.showLoading = () => {};
                ui.updateUI = () => {};
                ui.vault = vault;

                await ui.addEntry();

                return { vault: ui.vault, alerts };
            } finally {
                document.getElementById = originalGet;
                document.createElement = originalCreate;
            }
        }

        it('stores a normalized otpauth URI when given a bare Base32 secret', async () => {
            const { vault, alerts } = await runAddEntry({
                title: 'GitHub',
                password: 'pw',
                totp: 'JBSWY3DPEHPK3PXP'
            });

            expect(alerts.some(a => a.includes('Failed'))).toBe(false);
            const [sessionKey] = await vault._getSessionKey();
            const [plain, decErr] = await vault.entries[0].decrypt(sessionKey);
            expect(decErr).toBe(null);
            if (plain.totp !== 'otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP') {
                throw new Error(`stored unnormalized: ${plain.totp}`);
            }
        });

        it('surfaces a validation error and stores nothing for garbage input', async () => {
            const { vault, alerts } = await runAddEntry({
                title: 'Bad',
                password: 'pw',
                totp: 'not a secret!!'
            });

            if (vault.entries.length !== 0) throw new Error('garbage totp was encrypted and stored');
            expect(alerts.some(a => a.toLowerCase().includes('failed to add'))).toBe(true);
        });
    });
} else {
    describe('TOTP entry form', () => {
        it('Skipped outside Node-runner DOM shims', () => { expect(true).toBe(true); });
    });
}
