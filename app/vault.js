import { BatchEmbedder } from '../src/information-theory/steganography/batch-embedder.js';
import { BatchExtractor } from '../src/information-theory/steganography/batch-extractor.js';
import { FileScanner } from '../src/codec/file-scanner.js';
import { cryptoInstance } from '../src/information-theory/cryptography/crypto-compat.js';

/**
 * PasswordVault
 * 
 * Manages encrypted password storage across distributed JPEG images.
 */
class PasswordVault {
    constructor() {
        this.entries = [];
        this.metadata = {
            version: '1.0',
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
        this.isUnlocked = false;
        this.masterPassword = null;
    }

    /**
     * Add a new password entry
     */
    addEntry(entry) {
        const newEntry = {
            id: this.generateId(),
            ...entry,
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
        this.entries.push(newEntry);
        this.metadata.modified = new Date().toISOString();
        return newEntry;
    }

    /**
     * Update an existing entry
     */
    updateEntry(id, updates) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) throw new Error('Entry not found');

        this.entries[index] = {
            ...this.entries[index],
            ...updates,
            modified: new Date().toISOString()
        };
        this.metadata.modified = new Date().toISOString();
        return this.entries[index];
    }

    /**
     * Delete an entry
     */
    deleteEntry(id) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) throw new Error('Entry not found');

        this.entries.splice(index, 1);
        this.metadata.modified = new Date().toISOString();
    }

    /**
     * Search entries
     */
    search(query) {
        const lower = query.toLowerCase();
        return this.entries.filter(e =>
            e.title?.toLowerCase().includes(lower) ||
            e.url?.toLowerCase().includes(lower) ||
            e.username?.toLowerCase().includes(lower) ||
            e.notes?.toLowerCase().includes(lower)
        );
    }

    /**
     * Serialize vault to JSON
     */
    toJSON() {
        return {
            metadata: this.metadata,
            entries: this.entries
        };
    }

    /**
     * Load vault from JSON
     */
    fromJSON(data) {
        this.metadata = data.metadata || this.metadata;
        this.entries = data.entries || [];
    }

    /**
     * Save vault to distributed images
     */
    async save(imageFiles, password, onProgress = null) {
        const vaultData = JSON.stringify(this.toJSON());
        const vaultBytes = new TextEncoder().encode(vaultData);

        const embedder = new BatchEmbedder();
        const options = {
            password: password,
            filename: 'vault.json',
            eccProfile: 'Extreme',  // Maximum error correction for vault data
            ecc: true
        };

        console.log(`Saving vault: ${vaultBytes.length} bytes across ${imageFiles.length} images`);

        const embeddedFiles = await embedder.embed(vaultBytes, imageFiles, options, onProgress);

        return embeddedFiles;
    }

    /**
     * Load vault from distributed images
     */
    async load(imageFiles, password) {
        const extractor = new BatchExtractor();

        console.log(`Loading vault from ${imageFiles.length} images`);

        const result = await extractor.extract(imageFiles, password,
            (current, total, status) => {
                console.log(`Progress: ${current}/${total} - ${status}`);
            }
        );

        const vaultData = new TextDecoder().decode(result.data);
        const vault = JSON.parse(vaultData);

        this.fromJSON(vault);
        this.isUnlocked = true;
        this.masterPassword = password;

        console.log(`Vault loaded: ${this.entries.length} entries`);

        return this;
    }

    /**
     * Generate unique ID
     */
    generateId() {
        if (cryptoInstance && typeof cryptoInstance.randomUUID === 'function') {
            return cryptoInstance.randomUUID();
        }

        if (cryptoInstance && typeof cryptoInstance.getRandomValues === 'function') {
            const arr = new Uint8Array(16);
            cryptoInstance.getRandomValues(arr);
            arr[6] = (arr[6] & 0x0f) | 0x40;
            arr[8] = (arr[8] & 0x3f) | 0x80;
            return [...arr].map((b, i) => {
                const hex = b.toString(16).padStart(2, '0');
                if (i === 4 || i === 6 || i === 8 || i === 10) return '-' + hex;
                return hex;
            }).join('');
        }

        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Lock the vault
     */
    lock() {
        this.isUnlocked = false;
        this.masterPassword = null;
        // Don't clear entries - keep them in memory but require unlock to save
    }
}

// ============================================================================
// UI Controller
// ============================================================================

class VaultUI {
    constructor() {
        this.vault = new PasswordVault();
        this.currentEditId = null;
        this.initializeUI();
    }

    initializeUI() {
        // Buttons
        this.addBtn = document.getElementById('addBtn');
        this.createBtn = document.getElementById('createBtn');
        this.loadBtn = document.getElementById('loadBtn');
        this.saveBtn = document.getElementById('saveBtn');

        // Modal
        this.modal = document.getElementById('passwordModal');
        this.modalTitle = document.getElementById('modalTitle');
        this.passwordForm = document.getElementById('passwordForm');
        this.closeModal = document.getElementById('closeModal');
        this.cancelBtn = document.getElementById('cancelBtn');

        // Status
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.itemCount = document.getElementById('itemCount');

        // Content
        this.vaultContent = document.getElementById('vaultContent');

        // Event Listeners
        this.addBtn.addEventListener('click', () => this.showAddModal());
        this.createBtn.addEventListener('click', () => this.createVault());
        this.loadBtn.addEventListener('click', () => this.loadVault());
        this.saveBtn.addEventListener('click', () => this.saveVault());
        this.closeModal.addEventListener('click', () => this.hideModal());
        this.cancelBtn.addEventListener('click', () => this.hideModal());
        this.passwordForm.addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Close modal on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hideModal();
        });
    }

    async loadVault() {
        try {
            const password = prompt('Enter master password:');
            if (!password) return;

            // Use FileScanner to select directory
            const files = await FileScanner.scanDirectory('*.jpg');
            if (!files || files.length === 0) {
                alert('No JPEG files found in selected directory');
                return;
            }

            // Convert FileSystemFileHandle to File objects
            const fileObjects = [];
            for (const handle of files) {
                const file = await handle.getFile();
                fileObjects.push(file);
            }

            await this.vault.load(fileObjects, password);
            this.updateUI();
            alert(`Vault loaded successfully! ${this.vault.entries.length} entries found.`);

        } catch (error) {
            console.error('Failed to load vault:', error);
            alert(`Failed to load vault: ${error.message}`);
        }
    }

    async createVault() {
        try {
            const password = prompt('Create master password:');
            if (!password) return;

            const confirm = prompt('Confirm master password:');
            if (password !== confirm) {
                alert('Passwords do not match!');
                return;
            }

            // Create new empty vault
            this.vault = new PasswordVault();
            this.vault.isUnlocked = true;
            this.vault.masterPassword = password;

            this.updateUI();
            alert('New vault created! Add some passwords and then save to images.');

        } catch (error) {
            console.error('Failed to create vault:', error);
            alert(`Failed to create vault: ${error.message}`);
        }
    }

    async saveVault() {
        try {
            if (!this.vault.masterPassword) {
                alert('Vault is locked. Load it first.');
                return;
            }

            // Use FileScanner to select directory
            const files = await FileScanner.scanDirectory('*.jpg');
            if (!files || files.length === 0) {
                alert('No JPEG files found in selected directory');
                return;
            }

            // Convert FileSystemFileHandle to File objects
            const fileObjects = [];
            for (const handle of files) {
                const file = await handle.getFile();
                fileObjects.push(file);
            }

            // Show progress
            const progressMsg = document.createElement('div');
            progressMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--bg-secondary);padding:1rem;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:9999;';
            progressMsg.textContent = 'Analyzing images...';
            document.body.appendChild(progressMsg);

            try {
                const embeddedFiles = await this.vault.save(fileObjects, this.vault.masterPassword,
                    (current, total, status) => {
                        progressMsg.textContent = `${status} (${current}/${total})`;
                    }
                );

                document.body.removeChild(progressMsg);

                // Download the embedded files
                for (const { name, data } of embeddedFiles) {
                    const blob = new Blob([data], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = name;
                    a.click();
                    URL.revokeObjectURL(url);
                }

                alert(`✅ Vault saved successfully!\n\n${embeddedFiles.length} image(s) created.\nYour vault is now distributed across these images.`);

            } catch (error) {
                if (progressMsg.parentNode) {
                    document.body.removeChild(progressMsg);
                }
                throw error;
            }

        } catch (error) {
            console.error('Failed to save vault:', error);
            alert(`❌ Failed to save vault:\n\n${error.message}`);
        }
    }

    showAddModal() {
        this.currentEditId = null;
        this.modalTitle.textContent = 'Add Password';
        this.passwordForm.reset();
        this.modal.classList.add('active');
    }

    showEditModal(entry) {
        this.currentEditId = entry.id;
        this.modalTitle.textContent = 'Edit Password';

        document.getElementById('entryTitle').value = entry.title || '';
        document.getElementById('entryUrl').value = entry.url || '';
        document.getElementById('entryUsername').value = entry.username || '';
        document.getElementById('entryPassword').value = entry.password || '';
        document.getElementById('entryNotes').value = entry.notes || '';

        this.modal.classList.add('active');
    }

    hideModal() {
        this.modal.classList.remove('active');
        this.passwordForm.reset();
        this.currentEditId = null;
    }

    handleFormSubmit(e) {
        e.preventDefault();

        const entry = {
            title: document.getElementById('entryTitle').value,
            url: document.getElementById('entryUrl').value,
            username: document.getElementById('entryUsername').value,
            password: document.getElementById('entryPassword').value,
            notes: document.getElementById('entryNotes').value
        };

        if (this.currentEditId) {
            this.vault.updateEntry(this.currentEditId, entry);
        } else {
            this.vault.addEntry(entry);
        }

        this.updateUI();
        this.hideModal();
    }

    deleteEntry(id) {
        if (confirm('Are you sure you want to delete this entry?')) {
            this.vault.deleteEntry(id);
            this.updateUI();
        }
    }

    copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            // Change button text temporarily
            const originalText = button.textContent;
            button.textContent = '✅';
            button.style.color = 'var(--success-color, #4caf50)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.color = '';
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard');
        });
    }

    updateUI() {
        // Update status
        if (this.vault.isUnlocked) {
            this.statusDot.classList.add('unlocked');
            this.statusText.textContent = 'Unlocked';
            this.addBtn.disabled = false;
            this.saveBtn.disabled = false;
        } else {
            this.statusDot.classList.remove('unlocked');
            this.statusText.textContent = 'Locked';
            this.addBtn.disabled = true;
            this.saveBtn.disabled = true;
        }

        this.itemCount.textContent = `${this.vault.entries.length} items`;

        // Render entries
        this.renderEntries();
    }

    renderEntries() {
        if (this.vault.entries.length === 0) {
            this.vaultContent.innerHTML = `
                <div class="empty-state">
                    <h3>No Passwords Yet</h3>
                    <p>Click "Add Password" to create your first entry.</p>
                </div>
            `;
            return;
        }

        const html = `
            <div class="search-bar">
                <input type="text" placeholder="🔍 Search passwords..." id="searchInput">
            </div>
            <div class="password-list" id="passwordList">
                ${this.vault.entries.map(entry => this.renderPasswordCard(entry)).join('')}
            </div>
        `;

        this.vaultContent.innerHTML = html;

        // Add search functionality
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            const results = this.vault.search(e.target.value);
            document.getElementById('passwordList').innerHTML =
                results.map(entry => this.renderPasswordCard(entry)).join('');
            this.attachCardEventListeners();
        });

        this.attachCardEventListeners();
    }

    renderPasswordCard(entry) {
        return `
            <div class="password-card" data-id="${entry.id}">
                <div class="password-card-header">
                    <div>
                        <h3 class="password-title">${this.escapeHtml(entry.title)}</h3>
                        ${entry.url ? `<p class="password-url">${this.escapeHtml(entry.url)}</p>` : ''}
                    </div>
                    <div class="password-actions">
                        <button class="icon-btn edit-btn" title="Edit">✏️</button>
                        <button class="icon-btn delete-btn" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="password-card-body">
                    ${entry.username ? `
                        <span class="password-label">Username:</span>
                        <span class="password-value">${this.escapeHtml(entry.username)}</span>
                        <button class="icon-btn copy-btn" data-value="${this.escapeHtml(entry.username)}" title="Copy">📋</button>
                    ` : ''}
                    <span class="password-label">Password:</span>
                    <span class="password-value hidden" data-password="${this.escapeHtml(entry.password)}">••••••••</span>
                    <button class="icon-btn copy-btn" data-value="${this.escapeHtml(entry.password)}" title="Copy">📋</button>
                </div>
                ${entry.notes ? `<p class="text-muted" style="margin-top: 0.75rem; font-size: 0.875rem;">${this.escapeHtml(entry.notes)}</p>` : ''}
            </div>
        `;
    }

    attachCardEventListeners() {
        // Edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('.password-card').dataset.id;
                const entry = this.vault.entries.find(e => e.id === id);
                this.showEditModal(entry);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('.password-card').dataset.id;
                this.deleteEntry(id);
            });
        });

        // Copy buttons
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const value = e.target.dataset.value;
                this.copyToClipboard(value, e.target);
            });
        });

        // Toggle password visibility
        document.querySelectorAll('.password-value.hidden').forEach(el => {
            el.addEventListener('click', (e) => {
                const isHidden = e.target.classList.contains('hidden');
                if (isHidden) {
                    e.target.classList.remove('hidden');
                    e.target.textContent = e.target.dataset.password;
                } else {
                    e.target.classList.add('hidden');
                    e.target.textContent = '••••••••';
                }
            });
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
const ui = new VaultUI();
