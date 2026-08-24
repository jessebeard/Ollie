import { describe, it, expect } from '../../utils/test-runner.js';

/**
 * FileSystemHandle.requestPermission() requires transient user activation.
 * The save flow must therefore acquire write permission immediately after
 * the confirm dialog (fresh activation) and BEFORE the slow encrypt/embed
 * phase, which otherwise burns the ~5s activation window and makes Chrome
 * throw "User activation is required to request permissions".
 */

if (typeof document !== 'undefined') {
    describe('Save permission ordering', () => {
        it('requests write permission before encryption/embedding begins', async () => {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');

            const callOrder = [];
            let saveCallCount = 0;
            let permRequestCount = 0;

            const fakeHandle = {
                kind: 'file',
                name: 'carrier.jpg',
                queryPermission: async () => 'prompt',
                requestPermission: async () => {
                    permRequestCount++;
                    callOrder.push('requestPermission');
                    return 'granted';
                },
                getFile: async () => ({
                    name: 'carrier.jpg',
                    arrayBuffer: async () => new ArrayBuffer(8)
                })
            };

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
            const originalGetElementById = document.getElementById;
            document.getElementById = (id) => (id in elements && elements[id]) ? elements[id] : originalGetElementById(id);

            try {
                const ui = new VaultUI();
                ui.modals = {
                    confirm: async () => { callOrder.push('confirm'); return true; },
                    showAlert: async () => {},
                    prompt: async () => 'unused'
                };
                ui.showLoading = () => {};
                ui.droppedHandles = new Map([['carrier.jpg', fakeHandle]]);
                ui._sessionPassword = 'pw';
                ui.vault = {
                    isUnlocked: true,
                    save: async () => {
                        saveCallCount++;
                        callOrder.push('vault.save');
                        return [[], new Error('stop-before-write-phase')];
                    }
                };

                await ui.saveVault();

                expect(permRequestCount).toBe(1);
                expect(saveCallCount).toBe(1);
                expect(callOrder.indexOf('requestPermission')).toBeGreaterThanOrEqual(0);
                expect(callOrder.indexOf('requestPermission')).toBeLessThan(callOrder.indexOf('vault.save'));
                expect(callOrder.indexOf('confirm')).toBeLessThan(callOrder.indexOf('requestPermission'));
            } finally {
                document.getElementById = originalGetElementById;
            }
        });

        it('aborts cleanly without touching carriers when write permission is declined', async () => {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');

            const alerts = [];
            let saveCallCount = 0;

            const fakeHandle = {
                kind: 'file',
                name: 'locked.jpg',
                queryPermission: async () => 'prompt',
                requestPermission: async () => 'denied'
            };

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
            const originalGetElementById = document.getElementById;
            document.getElementById = (id) => (id in elements && elements[id]) ? elements[id] : originalGetElementById(id);

            try {
                const ui = new VaultUI();
                ui.modals = {
                    confirm: async () => true,
                    showAlert: async (title, message) => { alerts.push(title + ': ' + message); },
                    prompt: async () => 'unused'
                };
                ui.showLoading = () => {};
                ui.droppedHandles = new Map([['locked.jpg', fakeHandle]]);
                ui._sessionPassword = 'pw';
                ui.vault = {
                    isUnlocked: true,
                    save: async () => { saveCallCount++; return [[], null]; }
                };

                await ui.saveVault();

                expect(saveCallCount).toBe(0);
                expect(alerts.length).toBe(1);
                expect(alerts[0]).toContain('Write permission denied');
            } finally {
                document.getElementById = originalGetElementById;
            }
        });
    });
} else {
    describe('Save permission ordering', () => {
        it('Skipped outside Node-runner DOM shims', () => { expect(true).toBe(true); });
    });
}
