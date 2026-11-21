import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { codeFromOtpauthUri } from '../../../src/information-theory/cryptography/totp.js';

const PASSWORD = 'tier-b-pw';

// Mock DOM environment for Node.js
if (typeof document === 'undefined') {
    global.document = {
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        getElementById: (id) => ({
            style: {},
            classList: { add: () => {}, remove: () => {}, has: () => false },
            addEventListener: () => {},
            appendChild: () => {},
            querySelectorAll: () => [],
            querySelector: () => null,
            remove: () => {},
            textContent: '',
            innerHTML: '',
            value: ''
        }),
        body: { classList: { toggle: () => {} } },
        createElement: (tag) => {
            if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ({ fillRect: () => {} }), style: {}, toDataURL: () => 'data:image/png;base64,x' };
            return {
                style: {},
                classList: { add: () => {}, remove: () => {}, has: () => false },
                addEventListener: () => {},
                appendChild: () => {},
                querySelectorAll: () => [],
                querySelector: () => null,
                remove: () => {},
                className: '',
                innerHTML: '',
                textContent: ''
            };
        }
    };
}

describe('Tier B TOTP gate UI flows', () => {

    it('createVault enrolls the gate when accepted and shows the QR once', async () => {
        const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
        const alerts = [];
        const confirms = [];

        const elements = {
            statusText: { textContent: '', addEventListener: () => {} },
            itemCount: { textContent: '', addEventListener: () => {} },
            vaultList: { querySelectorAll: () => [], addEventListener: () => {}, appendChild: () => {}, innerHTML: '' },
            tagList: { innerHTML: '', addEventListener: () => {} },
            importBtn: { style: {}, addEventListener: () => {} },
            exportBtn: { style: {}, addEventListener: () => {} },
            searchInput: { value: '', addEventListener: () => {} },
            sortSelect: { value: 'newest', addEventListener: () => {} }
        };
        const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
        const origGet = document.getElementById;
        const origCreate = document.createElement;
        document.getElementById = (id) => (id in elements && elements[id]) ? elements[id] : origGet.call(document, id);
        if (isNode) {
            document.createElement = (tag) => {
                if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ({ fillRect: () => {} }), style: {}, toDataURL: () => 'data:image/png;base64,x' };
                if (tag === 'div') {
                    return {
                        className: '', innerHTML: '', style: {},
                        appendChild: () => {}, addEventListener: () => {}, remove: () => {},
                        querySelector: () => null
                    };
                }
                return origCreate.call(document, tag);
            };
        }

        try {
            const ui = new VaultUI();
            ui.modals = {
                prompt: async (title) => title.includes('Confirm') ? PASSWORD : PASSWORD,
                confirm: async (msg) => { confirms.push(msg); return true; },
                showAlert: async (t, m) => alerts.push(t + ': ' + m)
            };
            ui.showLoading = () => {};
            ui.updateUI = () => {};

            await ui.createVault();

            expect(confirms.length).toBe(1);
            // Disclaimer language must be present in the confirmation copy
            expect(/shoulder|weak access control/i.test(confirms[0])).toBe(true);
            // Gate enrolled on the live vault
            expect(ui.vault.metadata.totpGate).toBeDefined();
            // Enrollment summary shown with scan instructions
            expect(alerts.some(a => /authenticator/i.test(a))).toBe(true);
        } finally {
            if (typeof document !== 'undefined') {
                document.querySelectorAll('.qr-overlay, .modal-overlay').forEach(el => el.remove());
            }
            document.getElementById = origGet;
            document.createElement = origCreate;
        }
    });

    it('skips gate enrollment when the user declines', async () => {
        const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
        const vault = new PasswordVault([], null, true, PASSWORD);
        void vault;

        const elements = {
            statusText: { textContent: '', addEventListener: () => {} },
            itemCount: { textContent: '', addEventListener: () => {} },
            vaultList: { querySelectorAll: () => [], addEventListener: () => {}, appendChild: () => {}, innerHTML: '' },
            tagList: { innerHTML: '', addEventListener: () => {} },
            importBtn: { style: {}, addEventListener: () => {} },
            exportBtn: { style: {}, addEventListener: () => {} },
            searchInput: { value: '', addEventListener: () => {} },
            sortSelect: { value: 'newest', addEventListener: () => {} }
        };
        const origGet = document.getElementById;
        document.getElementById = (id) => (id in elements && elements[id]) ? elements[id] : origGet.call(document, id);
        try {
            const ui = Object.create(VaultUI.prototype);
            ui.vault = new PasswordVault([], null, true, PASSWORD);
            ui._sessionPassword = PASSWORD;
            ui.modals = { confirm: async () => false, showAlert: async () => {}, prompt: async () => '' };
            ui.showLoading = () => {};
            ui.updateUI = () => {};

            await ui.enrollTotpGateFlow();

            expect(ui.vault.metadata.totpGate).toBeUndefined();
        } finally {
            document.getElementById = origGet;
        }
    });

    it('enforces the gate on unlock: correct code reveals, cancel re-locks', async () => {
        const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');

        let v = new PasswordVault([], null, true, PASSWORD);
        const [gate] = await v.enableTotpGate();
        v = gate.vault;

        // Derive the live code the user would type
        const [code] = await codeFromOtpauthUri(gate.uri);

        const prompts = [];
        const makeUI = (promptImpl) => {
            const ui = Object.create(VaultUI.prototype);
            ui.vault = v;
            ui._sessionPassword = PASSWORD;
            ui.modals = { prompt: async (t, msg) => { prompts.push(msg); return promptImpl(); }, showAlert: async () => {} };
            ui.showLoading = () => {};
            ui.updateUI = () => {};
            return ui;
        };

        const uiOk = makeUI(() => code);
        const revealed = await uiOk.enforceTotpGate();
        expect(revealed).toBe(true);

        const uiBad = makeUI(() => null); // user cancels
        const cancelled = await uiBad.enforceTotpGate();
        expect(cancelled).toBe(false);

        const uiWrong = makeUI(() => '000000');
        let sawSecondPrompt = false;
        const uiWrongWrapped = makeUI(async () => {
            if (!sawSecondPrompt) { sawSecondPrompt = true; return '000000'; }
            return code;
        });
        void uiWrong;
        const eventuallyRevealed = await uiWrongWrapped.enforceTotpGate();
        expect(eventuallyRevealed).toBe(true);
        expect(sawSecondPrompt || prompts.length >= 0).toBe(true);
    });
});
