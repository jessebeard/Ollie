import { describe, it, expect } from '../../utils/test-runner.js';
import { VaultUI } from '../../../app/components/vault/vault-ui.js';
import { createMockJpeg } from '../../utils/jpeg-fixtures.js';

// Mock DOM environment for Node.js
if (typeof document === 'undefined') {
    global.document = {
        getElementById: (id) => {
            if (id === 'dropZone') return { addEventListener: () => {} };
            if (id === 'vaultList') return { querySelectorAll: () => [] };
            if (id === 'createBtn') return { addEventListener: () => {} };
            if (id === 'saveBtn') return { addEventListener: () => {} };
            if (id === 'addBtn') return { addEventListener: () => {} };
            if (id === 'importBtn') return { style: {}, addEventListener: () => {} };
            if (id === 'exportBtn') return { style: {}, addEventListener: () => {} };
            if (id === 'searchInput') return { addEventListener: () => {} };
            if (id === 'sortSelect') return { addEventListener: () => {} };
            if (id === 'itemCount') return { textContent: '' };
            if (id === 'statusText') return { textContent: '' };
            if (id === 'tagList') return { innerHTML: '' };
            if (id === 'loadingOverlay') return { style: {}, querySelector: () => ({ textContent: '' }) };
            if (id === 'capacityText') return { textContent: '', title: '' };
            return null;
        },
        body: { classList: { toggle: () => {} } },
        createElement: (tag) => {
            return {
                style: {},
                classList: { add: () => {}, remove: () => {}, has: () => false },
                addEventListener: () => {},
                appendChild: () => {},
                querySelector: () => ({ textContent: '' }),
                textContent: '',
                innerHTML: ''
            };
        }
    };
    global.window = {
        addEventListener: () => {}
    };
    if (typeof global.navigator === 'undefined') {
        try {
            global.navigator = { clipboard: { writeText: async () => {} } };
        } catch (_) {}
    } else if (global.navigator && !global.navigator.clipboard) {
        try {
            global.navigator.clipboard = { writeText: async () => {} };
        } catch (_) {}
    }
}

describe('Vault Capacity UI Integration', () => {
    it('should update capacity display when files are dropped', async () => {
        // Mock elements
        const capacityTextEl = { textContent: '' };
        const itemCountEl = { textContent: '' };
        const statusTextEl = { textContent: '' };
        
        const originalGetElementById = document.getElementById;
        document.getElementById = (id) => {
            if (id === 'capacityText') return capacityTextEl;
            if (id === 'itemCount') return itemCountEl;
            if (id === 'statusText') return statusTextEl;
            if (id === 'dropZone') return { addEventListener: () => {} };
            if (id === 'vaultList') return { querySelectorAll: () => [] };
            if (id === 'tagList') return { innerHTML: '' };
            if (id === 'searchInput') return { addEventListener: () => {} };
            if (id === 'sortSelect') return { addEventListener: () => {} };
            if (id === 'addBtn') return { addEventListener: () => {} };
            if (id === 'createBtn') return { addEventListener: () => {} };
            if (id === 'saveBtn') return { addEventListener: () => {} };
            if (id === 'importBtn') return { style: {}, addEventListener: () => {} };
            if (id === 'exportBtn') return { style: {}, addEventListener: () => {} };
            if (id === 'loadingOverlay') return { style: {}, querySelector: () => ({ textContent: '' }) };
            return originalGetElementById.call(document, id);
        };

        const ui = new VaultUI();
        
        // Mock prompt to unlock
        ui.modals.prompt = async () => 'password123';
        
        // Mock PasswordVault.load to return a successful vault
        const { PasswordVault } = await import('../../../src/structures/vault/immutable-vault.js');
        const originalLoad = PasswordVault.load;
        PasswordVault.load = async () => [new PasswordVault([], null, true, 'password123'), null];

        // Prepare mock files
        const mockFiles = [
            { name: 'carrier1.jpg', arrayBuffer: async () => new Uint8Array([0xFF, 0xD8, 0x00]).buffer },
            { name: 'carrier2.jpg', arrayBuffer: async () => new Uint8Array([0xFF, 0xD8, 0x00]).buffer }
        ];

        // Import CapacityScanner to mock its analyzer
        const { CapacityScanner } = await import('../../../src/codec/capacity-scanner.js');
        const originalScan = CapacityScanner.scan;
        CapacityScanner.scan = async (files) => {
            return [{ totalCapacity: 1024, imageCount: files.length, fileCapacities: new Map() }, null];
        };

        // Simulate drop
        await ui.handleFilesDropped(mockFiles);

        // Verify capacity was updated
        expect(capacityTextEl.textContent).toContain('Total: 1 KB');
        expect(capacityTextEl.textContent).toContain('Used:');

        // Restore
        CapacityScanner.scan = originalScan;

        // Restore
        PasswordVault.load = originalLoad;
        document.getElementById = originalGetElementById;
    });

    it('should format capacities correctly', () => {
        const ui = new VaultUI();
        expect(ui.formatSize(0)).toBe('0 bytes');
        expect(ui.formatSize(1024)).toBe('1 KB');
        expect(ui.formatSize(1048576)).toBe('1 MB');
    });

    it('should display used capacity correctly', async () => {
        const capacityTextEl = { textContent: '' };
        const originalGetElementById = document.getElementById;
        
        // Mock required elements for updateUI
        const elements = {
            'capacityText': capacityTextEl,
            'itemCount': { textContent: '', addEventListener: () => {} },
            'statusText': { textContent: '', addEventListener: () => {} },
            'vaultList': { querySelectorAll: () => [], addEventListener: () => {}, appendChild: () => {}, innerHTML: '' },
            'tagList': { innerHTML: '', addEventListener: () => {} },
            'importBtn': { style: {}, addEventListener: () => {} },
            'exportBtn': { style: {}, addEventListener: () => {} }
        };

        document.getElementById = (id) => elements[id] || originalGetElementById.call(document, id);

        const ui = new VaultUI();
        
        // Mock a vault with some entries
        const { PasswordVault } = await import('../../../src/structures/vault/immutable-vault.js');
        const { SecureEntry } = await import('../../../src/structures/vault/secure-record.js');
        
        const mockSecureEntry = SecureEntry.fromJSON({
            id: '1',
            title: 'Capacity Probe',
            url: 'https://example.invalid',
            username: 'u',
            created: '2026-01-01T00:00:00.000Z',
            modified: '2026-01-01T00:00:00.000Z',
            tags: [],
            _encrypted: { ciphertext: 'AAAA', iv: 'AAAA' }
        })[0];

        expect(mockSecureEntry).not.toEqual(null);
        
        ui.vault = new PasswordVault([mockSecureEntry], null, true, 'password123');
        ui.totalCapacity = 100 * 1024; // 100 KB
        
        ui.updateUI();
        
        const usedSize = ui.getVaultSize();
        const expectedUsedStr = ui.formatSize(usedSize);
        
        expect(capacityTextEl.textContent).toContain(`Used: ${expectedUsedStr}`);
        expect(capacityTextEl.textContent).toContain(`Total: 100 KB`);
        
        document.getElementById = originalGetElementById;
    });
});
