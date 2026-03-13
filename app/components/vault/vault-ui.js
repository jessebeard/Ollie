
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { DropZone } from './components/drop-zone.js';
import { ModalManager } from './components/modal-manager.js';
import { VaultView } from './components/vault-view.js';
import { FileScanner } from '../../../src/codec/file-scanner.js';
import { CapacityScanner } from '../../../src/codec/capacity-scanner.js';

class EventBus {
    constructor() { this.listeners = {}; }
    on(event, cb) { (this.listeners[event] = this.listeners[event] || []).push(cb); }
    emit(event, data) { (this.listeners[event] || []).forEach(cb => cb(data)); }
}

export class VaultUI {
    constructor() {
        this.vault = new PasswordVault();
        this.events = new EventBus();
        this.modals = new ModalManager();
        this.view = null;
        this.activeTags = new Set();
        this.currentQuery = '';
        this.currentSort = 'newest';
        this.totalCapacity = 0;

        this.initialize();
    }

    initialize() {
        // Drop Zone
        const dropEl = document.getElementById('dropZone');
        new DropZone(dropEl, (files) => this.handleFilesDropped(files));

        // View
        const viewEl = document.getElementById('vaultList');
        this.view = new VaultView(viewEl, this.events);

        // Bind Events
        this.events.on('edit-entry', (e) => this.editEntry(e));
        this.events.on('copy-password', (p) => this.copyPassword(p));

        // Buttons
        document.getElementById('createBtn').addEventListener('click', () => this.createVault());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveVault());
        document.getElementById('addBtn').addEventListener('click', () => this.addEntry());
        document.getElementById('importBtn').addEventListener('click', () => this.importData());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());

        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.currentQuery = e.target.value.trim();
            this.updateUI();
        });

        const sortSelect = document.getElementById('sortSelect');
        sortSelect.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.updateUI();
        });

        // Initial State
        this.updateState();
    }

    async handleFilesDropped(items) {
        if (items.length === 0) return;

        // Separate Handles and Files
        const filesToLoad = [];
        this.droppedHandles = new Map(); // Store handlers for saving

        for (const item of items) {
            if (item.kind === 'file' && item.getFile) {
                // It's a Handle
                try {
                    const file = await item.getFile();
                    if (FileScanner.matchesPattern(file.name, '*.jpg') || FileScanner.matchesPattern(file.name, '*.jpeg')) {
                        filesToLoad.push(file);
                        this.droppedHandles.set(file.name, item);
                    }
                } catch (e) {
                    console.warn('Failed to get file from handle:', e);
                }
            } else {
                // It's a standard File object
                if (item.name && (FileScanner.matchesPattern(item.name, '*.jpg') || FileScanner.matchesPattern(item.name, '*.jpeg'))) {
                    filesToLoad.push(item);
                } else if (!item.name && (item.type === 'image/jpeg' || item.type === 'image/jpg')) {
                    filesToLoad.push(item);
                }
            }
        }

        if (filesToLoad.length === 0) return;

        try {
            const password = await this.modals.prompt('Unlock Vault', 'Enter Master Password:', 'password');
            if (!password) return;

            this.showLoading(true, 'Decrypting...');
            const [newVault, loadErr] = await PasswordVault.load(filesToLoad, password);
            this.showLoading(false);

            if (loadErr) {
                this.modals.showAlert('Error', 'Failed to load vault: ' + loadErr.message, 'error');
                return;
            }

            this.vault = newVault;
            this.modals.showAlert('Success', `Loaded ${this.vault.entries.length} entries.`);
            
            // Scan for capacity
            const [scanResult, scanErr] = await CapacityScanner.scan(filesToLoad, {
                f5Options: {
                    format: 'container',
                    ecc: true,
                    eccProfile: 'Extreme',
                    encrypted: true,
                    metadata: { filename: 'vault.json' }
                }
            });
            if (!scanErr) {
                this.totalCapacity = scanResult.totalCapacity;
            }

            this.updateUI();

        } catch (e) {
            this.showLoading(false);
            this.modals.showAlert('Error', 'Unexpected error: ' + e.message, 'error');
        }
    }

    async createVault() {
        const pass1 = await this.modals.prompt('New Vault', 'Create Master Password:', 'password');
        if (!pass1) return;

        const pass2 = await this.modals.prompt('New Vault', 'Confirm Master Password:', 'password');
        if (pass1 !== pass2) {
            this.modals.showAlert('Error', 'Passwords do not match', 'error');
            return;
        }

        this.vault = new PasswordVault([], null, true, pass1);

        this.updateUI();
        this.modals.showAlert('Created', 'New vault created. Add entries and save.');
    }

    async addEntry() {
        const fields = [
            { name: 'title', label: 'Title', required: true },
            { name: 'username', label: 'Username' },
            { name: 'password', label: 'Password', type: 'password' },
            { name: 'url', label: 'URL', type: 'url' },
            { name: 'tags', label: 'Tags (comma separated)' },
            { name: 'notes', label: 'Notes', type: 'textarea' }
        ];

        const data = await this.modals.showForm('Add New Entry', fields);
        if (!data) return;

        this.showLoading(true, 'Encrypting...');
        const [newVault, err] = await this.vault.addEntry(data);
        this.showLoading(false);

        if (err) {
            this.modals.showAlert('Error', 'Failed to add entry: ' + err.message, 'error');
            return;
        }

        this.vault = newVault;
        this.updateUI();
        this.modals.showAlert('Success', 'Entry added.');
    }

    async editEntry(id) {
        if (!this.vault.isUnlocked) return;

        const currentSecure = this.vault.entries.find(e => e.id === id);
        if (!currentSecure) return;

        this.showLoading(true, 'Decrypting...');
        const [sessionKey, kErr] = await this.vault._getSessionKey();
        if (kErr) {
            this.showLoading(false);
            this.modals.showAlert('Error', 'Vault lock error', 'error');
            return;
        }

        const [decrypted, decErr] = await currentSecure.decrypt(sessionKey);
        this.showLoading(false);
        if (decErr) {
            this.modals.showAlert('Error', 'Failed to decrypt entry', 'error');
            return;
        }

        const fields = [
            { name: 'title', label: 'Title', required: true },
            { name: 'username', label: 'Username' },
            { name: 'password', label: 'Password', type: 'password' },
            { name: 'url', label: 'URL', type: 'url' },
            { name: 'tags', label: 'Tags (comma separated)' },
            { name: 'notes', label: 'Notes', type: 'textarea' }
        ];

        // Prepare initial values (join tags back to string)
        const initial = { ...decrypted };
        if (Array.isArray(initial.tags)) {
            initial.tags = initial.tags.join(', ');
        }

        const data = await this.modals.showForm('Edit Entry', fields, initial);
        if (!data) return;

        this.showLoading(true, 'Encrypting...');
        const [newVault, err] = await this.vault.updateEntry(id, data);
        this.showLoading(false);

        if (err) {
            this.modals.showAlert('Error', 'Failed to edit entry: ' + err.message, 'error');
            return;
        }

        this.vault = newVault;
        this.updateUI();
    }



    async saveVault() {
        if (!this.vault.masterPassword) return;

        try {
            // 1. Confirm intention
            const confirmed = await this.modals.confirm(
                'Select a folder with JPEG images.<br><br>' +
                'The vault data will be hidden inside these images.<br>' +
                '<b>Existing functionality in these images will remain, but they will be modified.</b>'
            );
            if (!confirmed) return;

            // 2. Select Directory or Use Dropped Handles
            let handles = [];
            let reusedHandles = false;

            if (this.droppedHandles && this.droppedHandles.size > 0) {
                // Check if we want to reuse dropped handles?
                // Yes, if the user doesn't want to pick a new folder.
                // Let's ask or just infer?
                // Ideally we verify if the handles are writable.
                // Assuming they are the same file set.
                console.log('Using dropped handles for saving...');
                handles = Array.from(this.droppedHandles.values());
                reusedHandles = true;
            } else {
                try {
                    handles = await FileScanner.scanDirectory('*.jpg');
                } catch (e) {
                    if (e.name === 'AbortError') return;
                    throw e;
                }
            }

            if (handles.length === 0) {
                this.modals.showAlert('Error', 'No JPEG images found.', 'error');
                return;
            }

            // 3. Prepare Files
            this.showLoading(true, 'Reading images...');
            const fileObjs = [];
            const handleMap = new Map(); // name -> handle

            for (const h of handles) {
                const file = await h.getFile();
                fileObjs.push(file);
                handleMap.set(file.name, h);
            }

            // 4. Embed Data
            this.showLoading(true, 'Encrypting & Saving...');

            // vault.save returns array of { name, data }
            const results = await this.vault.save(fileObjs, this.vault.masterPassword,
                (curr, total, status) => {
                    this.showLoading(true, `${status} (${curr}/${total})`);
                }
            );

            // 5. Write back to disk
            this.showLoading(true, 'Writing files to disk...');

            console.log(`Available handles in map: ${Array.from(handleMap.keys()).join(', ')}`);

            for (const result of results) {
                let originalName = result.name;
                const prefixMatch = result.name.match(/^steg_\d+_(.+)$/);
                if (prefixMatch) {
                    originalName = prefixMatch[1];
                }

                let handle = handleMap.get(originalName);
                if (!handle) handle = handleMap.get(result.name);

                if (handle) {
                    console.log(`Writing result ${result.name} to ${handle.name}...`);

                    // Verify/Request Permission
                    const options = { mode: 'readwrite' };
                    if ((await handle.queryPermission(options)) !== 'granted') {
                        const perm = await handle.requestPermission(options);
                        if (perm !== 'granted') {
                            console.error(`Permission denied for ${handle.name}`);
                            continue;
                        }
                    }

                    const writable = await handle.createWritable();
                    await writable.write(result.data);
                    await writable.close();
                    console.log(`Successfully wrote to ${handle.name}`);
                } else {
                    console.warn(`Could not find handle for ${result.name} (original: ${originalName})`);
                }
            }

            this.showLoading(false);
            this.modals.showAlert('Saved', `Vault successfully saved to ${results.length} images.`);

            // Update handles and capacity if we saved to a new set
            if (!reusedHandles) {
                this.droppedHandles = new Map();
                for (const result of results) {
                    // This is a bit tricky because handles are from scanDirectory
                }
            }
            
            // Re-scan for capacity after save (since carrier images might have changed)
            const [scanResult, scanErr] = await CapacityScanner.scan(fileObjs, {
                f5Options: {
                    format: 'container',
                    ecc: true,
                    eccProfile: 'Extreme',
                    encrypted: true,
                    metadata: { filename: 'vault.json' }
                }
            });
            if (!scanErr) {
                this.totalCapacity = scanResult.totalCapacity;
            }
            this.updateUI();

        } catch (e) {
            this.showLoading(false);
            console.error(e);
            this.modals.showAlert('Error', 'Save failed: ' + e.message, 'error');
        }
    }

    async copyPassword(id) {
        if (!this.vault.isUnlocked) return;

        const currentSecure = this.vault.entries.find(e => e.id === id);
        if (!currentSecure) return;

        const [sessionKey, kErr] = await this.vault._getSessionKey();
        if (kErr) return;

        const [decrypted, decErr] = await currentSecure.decrypt(sessionKey);
        if (decErr) return;

        navigator.clipboard.writeText(decrypted.password);
        this.modals.showAlert('Copied', 'Password copied to clipboard!');
    }

    async importData() {
        if (!this.vault.isUnlocked) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.entries || !Array.isArray(data.entries)) {
                    this.modals.showAlert('Error', 'Invalid import format. Expected an array of entries.', 'error');
                    return;
                }

                this.showLoading(true, 'Importing ' + data.entries.length + ' entries...');

                let currentVault = this.vault;
                let addedCount = 0;
                let errorCount = 0;

                for (const entry of data.entries) {
                    const [newVault, err] = await currentVault.addEntry(entry, entry.id);
                    if (err) {
                        console.error('Failed to import entry:', err);
                        errorCount++;
                    } else {
                        currentVault = newVault;
                        addedCount++;
                    }
                }

                this.vault = currentVault;
                this.updateUI();
                this.showLoading(false);

                this.modals.showAlert('Import Complete', `Successfully imported ${addedCount} entries. ${errorCount > 0 ? `Failed to import ${errorCount} entries.` : ''}`);

            } catch (err) {
                this.showLoading(false);
                this.modals.showAlert('Error', 'Failed to read or parse import file: ' + err.message, 'error');
            }
        };

        input.click();
    }

    async exportData() {
        if (!this.vault.isUnlocked) return;

        const warningMsg = `🔴 SECURITY WARNING: Red Flag Operation<br><br>You are about to export your entire vault in PLAINTEXT. This means all passwords and secrets will be saved in an unencrypted JSON file on your computer.<br><br>Anyone who gains access to this file will have immediate access to all your passwords.<br><br>Are you absolutely sure you want to proceed?`;

        const confirmed = await this.modals.confirm(warningMsg);
        if (!confirmed) return;

        this.showLoading(true, 'Decrypting vault...');
        const [jsonStr, err] = await this.vault.getPlaintextJSON();
        this.showLoading(false);

        if (err) {
            this.modals.showAlert('Error', 'Export failed: ' + err.message, 'error');
            return;
        }

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ollie-vault-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    getVaultSize() {
        if (!this.vault) return 0;
        const json = JSON.stringify(this.vault.toJSON());
        return new TextEncoder().encode(json).length;
    }

    updateUI() {
        const vaultList = document.getElementById('vaultList');
        const itemCount = document.getElementById('itemCount');
        const statusText = document.getElementById('statusText');
        const capacityText = document.getElementById('capacityText');

        if (!this.vault) {
            statusText.textContent = 'Locked';
            return;
        }

        const unlocked = !!this.vault.masterPassword; // Simple check
        document.body.classList.toggle('vault-unlocked', unlocked);

        const importBtn = document.getElementById('importBtn');
        const exportBtn = document.getElementById('exportBtn');

        if (unlocked) {
            importBtn.style.display = 'block';
            exportBtn.style.display = 'block';
            this.renderSidebarTags();

            let filteredResults = this.vault.search(this.currentQuery, Array.from(this.activeTags));
            filteredResults = this.sortEntries(filteredResults, this.currentSort);

            this.view.render(filteredResults);
            itemCount.textContent = `${filteredResults.length} Items`;
            
            // Update capacity display
            if (capacityText) {
                const usedSize = this.getVaultSize();
                const usedStr = this.formatSize(usedSize);
                const totalStr = this.formatSize(this.totalCapacity || 0);
                capacityText.textContent = `Used: ${usedStr} / Total: ${totalStr}`;
                capacityText.title = `Vault currently uses ${usedStr} of ${totalStr} available steganographic space (Extreme ECC enabled).`;

                const progressEl = document.getElementById('capacityProgress');
                if (progressEl) {
                    const percent = this.totalCapacity > 0 ? Math.min(100, (usedSize / this.totalCapacity) * 100) : 0;
                    progressEl.style.width = `${percent}%`;
                    
                    progressEl.classList.remove('warning', 'danger');
                    if (percent > 90) progressEl.classList.add('danger');
                    else if (percent > 75) progressEl.classList.add('warning');
                }
            }

            statusText.textContent = 'Unlocked';
        } else {
            statusText.textContent = 'Locked';
        }
    }

    sortEntries(entries, sortMethod) {
        return entries.slice().sort((a, b) => { // Shallow copy to avoid mutating cache
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            switch (sortMethod) {
                case 'az': return titleA.localeCompare(titleB);
                case 'za': return titleB.localeCompare(titleA);
                case 'oldest': return a.id.localeCompare(b.id); // Hack: IDs are usually time-based or serial UUIDs, but ideally we'd use a real created_at date. 
                case 'newest':
                default:
                    return b.id.localeCompare(a.id);
            }
        });
    }

    renderSidebarTags() {
        const tagListEl = document.getElementById('tagList');
        tagListEl.innerHTML = '';

        // Extract all unique tags
        const allTags = new Set();
        this.vault.entries.forEach(e => {
            if (e.tags) e.tags.forEach(t => allTags.add(t));
        });

        if (allTags.size === 0) {
            tagListEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">No tags</div>';
            return;
        }

        Array.from(allTags).sort().forEach(tag => {
            const span = document.createElement('span');
            span.className = `tag tag-interactive ${this.activeTags.has(tag) ? 'tag-active' : ''}`;
            span.textContent = tag;
            span.addEventListener('click', () => {
                if (this.activeTags.has(tag)) this.activeTags.delete(tag);
                else this.activeTags.add(tag);
                this.updateUI();
            });
            tagListEl.appendChild(span);
        });
    }

    updateState() {
        this.updateUI();
    }

    showLoading(show, text) {
        // Simple loading overlay logic
        const el = document.getElementById('loadingOverlay');
        if (el) {
            el.style.display = show ? 'flex' : 'none';
            if (text) el.querySelector('p').textContent = text;
        }
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 bytes';
        const k = 1024;
        const sizes = ['bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Init
// Init only if we are in a browser and not in a test runner that handles it manually.
if (typeof window !== 'undefined' && !window.__TEST_RUNNER__) {
    new VaultUI();
}
