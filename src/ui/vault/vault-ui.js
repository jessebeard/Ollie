
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
        this.activeTags = new Set();
        this.currentQuery = '';
        this.currentSort = 'newest';

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

        const [newVault, err] = this.vault.addEntry(data);
        if (err) {
            this.modals.showAlert('Error', 'Failed to add entry: ' + err.message, 'error');
            return;
        }

        this.vault = newVault;
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

        const [newVault, err] = this.vault.updateEntry(entry.id, data);
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

        } catch (e) {
            this.showLoading(false);
            console.error(e);
            this.modals.showAlert('Error', 'Save failed: ' + e.message, 'error');
        }
    }

    copyPassword(pass) {
        navigator.clipboard.writeText(pass);
        this.modals.showAlert('Copied', 'Password copied to clipboard!');
    }

    updateUI() {
        const unlocked = !!this.vault.masterPassword; // Simple check
        document.body.classList.toggle('vault-unlocked', unlocked);

        if (unlocked) {
            this.renderSidebarTags();

            let filteredResults = this.vault.search(this.currentQuery, Array.from(this.activeTags));
            filteredResults = this.sortEntries(filteredResults, this.currentSort);

            this.view.render(filteredResults);
            document.getElementById('itemCount').textContent = `${filteredResults.length} Items`;
            document.getElementById('statusText').textContent = 'Unlocked';
        } else {
            document.getElementById('statusText').textContent = 'Locked';
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
}

// Init
new VaultUI();
