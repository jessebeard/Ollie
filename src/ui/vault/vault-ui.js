
import { PasswordVault } from '../../core/vault/vault-manager.js';
import { DropZone } from './components/drop-zone.js';
import { ModalManager } from './components/modal-manager.js';
import { VaultView } from './components/vault-view.js';
import { FileScanner } from '../../utils/file-scanner.js';

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
                    filesToLoad.push(file);
                    this.droppedHandles.set(file.name, item);
                } catch (e) {
                    console.warn('Failed to get file from handle:', e);
                }
            } else {
                // It's a standard File object
                filesToLoad.push(item);
            }
        }

        if (filesToLoad.length === 0) return;

        try {
            const password = await this.modals.prompt('Unlock Vault', 'Enter Master Password:', 'password');
            if (!password) return;

            this.showLoading(true, 'Decrypting...');
            await this.vault.load(filesToLoad, password);
            this.showLoading(false);

            this.modals.showAlert('Success', `Loaded ${this.vault.entries.length} entries.`);
            this.updateUI();

        } catch (e) {
            this.showLoading(false);
            this.modals.showAlert('Error', 'Failed to load vault: ' + e.message, 'error');
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

        this.vault = new PasswordVault();
        this.vault.masterPassword = pass1;
        this.vault.isUnlocked = true; // Use this flag to enable UI

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

        this.vault.addEntry(data);
        this.updateUI();
        this.modals.showAlert('Success', 'Entry added.');
    }

    async editEntry(entry) {
        const fields = [
            { name: 'title', label: 'Title', required: true },
            { name: 'username', label: 'Username' },
            { name: 'password', label: 'Password', type: 'password' },
            { name: 'url', label: 'URL', type: 'url' },
            { name: 'tags', label: 'Tags (comma separated)' },
            { name: 'notes', label: 'Notes', type: 'textarea' }
        ];

        // Prepare initial values (join tags back to string)
        const initial = { ...entry };
        if (Array.isArray(initial.tags)) {
            initial.tags = initial.tags.join(', ');
        }

        const data = await this.modals.showForm('Edit Entry', fields, initial);
        if (!data) return;

        this.vault.updateEntry(entry.id, data);
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

        } catch (e) {
            this.showLoading(false);
            console.error(e);
            this.modals.showAlert('Error', 'Save failed: ' + e.message, 'error');
        }
    }

    copyPassword(pass) {
        navigator.clipboard.writeText(pass);
        // Toast?
        console.log('Copied');
    }

    updateUI() {
        const unlocked = !!this.vault.masterPassword; // Simple check
        document.body.classList.toggle('vault-unlocked', unlocked);

        if (unlocked) {
            this.view.render(this.vault.entries);
            document.getElementById('itemCount').textContent = `${this.vault.entries.length} Items`;
            document.getElementById('statusText').textContent = 'Unlocked';
        } else {
            document.getElementById('statusText').textContent = 'Locked';
        }
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
}

// Init
new VaultUI();
