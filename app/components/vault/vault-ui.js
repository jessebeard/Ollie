import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { DropZone } from './components/drop-zone.js';
import { ModalManager } from './components/modal-manager.js';
import { VaultView } from './components/vault-view.js';
import { FileScanner } from '../../../src/codec/file-scanner.js';
import { CapacityScanner } from '../../../src/codec/capacity-scanner.js';
import { logger } from '../../../src/utils/logger.js';
import { writeAllWithRollback } from '../../../src/utils/atomic-writer.js';
import { codeFromOtpauthUri, normalizeTotpInput, buildOtpauthUri } from '../../../src/information-theory/cryptography/totp.js';
import { decodeQR } from '../../../src/codec/qr-decoder.js';
import { KeyDerivation } from '../../../src/information-theory/cryptography/pbkdf2.js';
import { encodeBase32 } from '../../../src/utils/base32.js';
import { getCrypto } from '../../../src/information-theory/cryptography/crypto-provider.js';
import { importFromCsv } from '../../../src/structures/vault/csv-import.js';
import { escapeHtml } from '../../../src/utils/escape-html.js';

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
        this.tagSortMode = 'count';
        this.tagSortDir = 'desc';
        this.totalCapacity = 0;
        this.totalDirectoryBytes = 0;
        this.mascotState = 'static';
        this.viewMode = 'sidebar';
        if (typeof localStorage !== 'undefined') {
            try {
                const savedMode = localStorage.getItem('ollie-view-mode');
                if (savedMode === 'card' || savedMode === 'both' || savedMode === 'sidebar') {
                    this.viewMode = savedMode;
                }
            } catch (_) {}
        }
        this._vaultSizeCache = 0;
        this._vaultSizeCacheKey = '';
        this._clipboardTimer = null;
        this._lastCopiedSecret = null;

        this.initialize();
    }

    initialize() {
        // Drop Zone
        const dropEl = document.getElementById('dropZone');
        if (dropEl) {
            new DropZone(dropEl, (files) => this.handleFilesDropped(files));

            dropEl.addEventListener('dragenter', () => this.setMascotState('animated'));
            dropEl.addEventListener('dragleave', (e) => {
                if (!e.relatedTarget) {
                    this.setMascotState(this.vault && this.vault.isUnlocked ? 'static' : 'static');
                }
            });
        }

        // View
        const viewEl = document.getElementById('vaultList');
        if (viewEl) {
            this.view = new VaultView(viewEl, this.events);
            this.view.setViewMode(this.viewMode);
        }

        // Bind Events
        this.events.on('edit-entry', (e) => this.editEntry(e));
        this.events.on('scan-qr-file', (e) => this.handleScanQrFile(e));
        this.events.on('copy-password', (p) => this.copyPassword(p));
        this.events.on('entry-selected', (e) => this.handleEntrySelected(e));
        this.events.on('unsafe-url-blocked', () => {
            this.modals.showAlert('Blocked', 'That entry URL uses an unsupported scheme. Only http(s) links can be opened.', 'error');
        });

        // Layout View Mode Switcher
        const modeBtns = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
            ? document.querySelectorAll('.view-mode-btn')
            : [];
        modeBtns.forEach(btn => {
            if (btn.classList) btn.classList.toggle('active', btn.dataset.mode === this.viewMode);
            btn.addEventListener('click', () => {
                this.setViewMode(btn.dataset.mode);
            });
        });
        this.setViewMode(this.viewMode);

        // Keyboard Shortcuts Button & Window Keydown Listener
        const shortcutsBtn = document.getElementById('shortcutsBtn');
        if (shortcutsBtn) {
            shortcutsBtn.addEventListener('click', () => this.modals.showShortcutsModal());
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', (e) => this.handleKeyDown(e));
            window.addEventListener('resize', () => {
                if (this.view && typeof this.view.reanchor === 'function') {
                    this.view.reanchor();
                }
            });
        }

        // Tag Sort Toggle & Direction Buttons
        const tagSortBtn = document.getElementById('tagSortToggleBtn');
        const tagSortDirBtn = document.getElementById('tagSortDirBtn');

        const updateTagSortControls = () => {
            if (tagSortBtn) {
                tagSortBtn.textContent = this.tagSortMode === 'count' ? 'Freq' : 'A-Z';
                tagSortBtn.title = this.tagSortMode === 'count'
                    ? 'Sorting by frequency (click for A-Z)'
                    : 'Sorting alphabetically (click for frequency)';
            }
            if (tagSortDirBtn) {
                tagSortDirBtn.textContent = this.tagSortDir === 'desc' ? '↓' : '↑';
                tagSortDirBtn.title = this.tagSortDir === 'desc'
                    ? 'Descending (click for Ascending)'
                    : 'Ascending (click for Descending)';
            }
        };

        if (tagSortBtn) {
            updateTagSortControls();
            tagSortBtn.addEventListener('click', () => {
                this.tagSortMode = this.tagSortMode === 'count' ? 'az' : 'count';
                updateTagSortControls();
                this.renderTags();
            });
        }

        if (tagSortDirBtn) {
            updateTagSortControls();
            tagSortDirBtn.addEventListener('click', () => {
                this.tagSortDir = this.tagSortDir === 'desc' ? 'asc' : 'desc';
                updateTagSortControls();
                this.renderTags();
            });
        }

        // Buttons
        const createBtn = document.getElementById('createBtn');
        if (createBtn) createBtn.addEventListener('click', () => this.createVault());
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveVault());
        const lockBtn = document.getElementById('lockBtn');
        if (lockBtn) lockBtn.addEventListener('click', () => this.lockVault());
        const changePwBtn = document.getElementById('changePwBtn');
        if (changePwBtn) changePwBtn.addEventListener('click', () => this.changeMasterPasswordFlow());
        const totpSettingsBtn = document.getElementById('totpSettingsBtn');
        if (totpSettingsBtn) totpSettingsBtn.addEventListener('click', () => this.manage2FaGateFlow());
        const addBtn = document.getElementById('addBtn');
        if (addBtn) addBtn.addEventListener('click', () => this.addEntry());
        const importBtn = document.getElementById('importBtn');
        if (importBtn) importBtn.addEventListener('click', () => this.importData());
        const exportEncryptedBtn = document.getElementById('exportEncryptedBtn');
        if (exportEncryptedBtn) exportEncryptedBtn.addEventListener('click', () => this.exportEncryptedData());
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());

        // Debounce search input
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.currentQuery = e.target.value.trim();
                    this.updateUI();
                }, 150);
            });
        }

        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.updateUI();
            });
        }

        const tagSearchInput = document.getElementById('tagSearchInput');
        if (tagSearchInput) {
            tagSearchInput.addEventListener('input', (e) => {
                this.tagSearchQuery = e.target.value.trim().toLowerCase();
                this.renderTags();
            });
        }

        const clearTagsBtn = document.getElementById('clearTagsBtn');
        if (clearTagsBtn) {
            clearTagsBtn.addEventListener('click', () => {
                this.activeTags.clear();
                this.updateUI();
            });
        }

        // Initial State
        this.updateState();
    }

    _notify(message, type = 'info') {
        if (this.modals && typeof this.modals.showToast === 'function') {
            try {
                this.modals.showToast(message, type);
                return;
            } catch (_) {}
        }
        if (this.modals && typeof this.modals.showAlert === 'function') {
            this.modals.showAlert(type === 'error' ? 'Error' : 'Notification', message, type);
        }
    }

    async handleFilesDropped(items, errors) {
        if (!items || items.length === 0) {
            if (errors && errors.length > 0) {
                const detail = errors.length === 1 ? errors[0].message : errors.length + ' read errors';
                this.modals.showAlert('Drop Failed', 'Could not read the dropped items: ' + detail, 'error');
            } else {
                this.modals.showAlert('No Carriers Found', 'No JPEG (.jpg / .jpeg) carrier images were found in the dropped files or folders. Only JPEG images can be used.', 'error');
            }
            return;
        }

        const filesToLoad = [];
        this.droppedHandles = new Map();
        let totalDirBytes = 0;

        for (const item of items) {
            if (item.kind === 'file' && item.getFile) {
                try {
                    const file = await item.getFile();
                    if (FileScanner.matchesPattern(file.name, '*.jpg') || FileScanner.matchesPattern(file.name, '*.jpeg')) {
                        filesToLoad.push(file);
                        totalDirBytes += (file.size || 0);
                        this.droppedHandles.set(file.name, item);
                    }
                } catch (e) {
                    console.warn('Failed to get file from handle:', e);
                }
            } else {
                if (item.name && (FileScanner.matchesPattern(item.name, '*.jpg') || FileScanner.matchesPattern(item.name, '*.jpeg'))) {
                    filesToLoad.push(item);
                    totalDirBytes += (item.size || 0);
                } else if (!item.name && (item.type === 'image/jpeg' || item.type === 'image/jpg')) {
                    filesToLoad.push(item);
                    totalDirBytes += (item.size || 0);
                }
            }
        }
        this.totalDirectoryBytes = totalDirBytes;

        if (filesToLoad.length === 0) {
            this.setMascotState('sad');
            this.modals.showAlert('No Carriers Found', 'No JPEG (.jpg / .jpeg) carrier images were found in the dropped files or folders. Only JPEG images can be used.', 'error');
            return;
        }

        try {
            const password = await this.modals.prompt('Unlock Vault', 'Enter Master Password:', 'password');
            if (!password) {
                this.setMascotState('static');
                return;
            }

            this.setMascotState('thinking');
            this.showLoading(true, 'Decrypting...');
            const [newVault, loadErr] = await PasswordVault.load(filesToLoad, password);
            this.showLoading(false);

            if (loadErr) {
                this.setMascotState('sad');
                this.modals.showAlert('Error', 'Failed to load vault: ' + loadErr.message, 'error');
                return;
            }

            this.vault = newVault;
            this._sessionPassword = password;
            const gateOk = await this.enforceTotpGate();
            if (!gateOk) {
                this.vault = null;
                this.setMascotState('static');
                this.updateUI();
                return;
            }
            this.setMascotState('happy');
            this._notify(`Loaded ${this.vault.entries.length} entries.`, 'success');

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
            this.setMascotState('sad');
            this.showLoading(false);
            this.modals.showAlert('Error', 'Unexpected error: ' + e.message, 'error');
        }
    }

    async generateTempTotp() {
        const [cryptoObj] = getCrypto();
        const secretBytes = new Uint8Array(20);
        cryptoObj.getRandomValues(secretBytes);
        const secret = encodeBase32(secretBytes);
        const [uri, uriErr] = buildOtpauthUri({ label: 'Ollie Vault', secret });
        if (uriErr) return [null, uriErr];
        return [{ secret, uri }, null];
    }

    async createVault() {
        if (this.modals && typeof this.modals.showOnboardingWizard === 'function') {
            const result = await this.modals.showOnboardingWizard({
                onBenchmark: () => KeyDerivation.benchmark(),
                generateQr: () => this.generateTempTotp()
            });

            if (!result) return;

            let metadata = null;
            if (result.enableTotp && result.totpSecret) {
                metadata = {
                    version: '3.0',
                    revision: 0,
                    created: new Date().toISOString(),
                    modified: new Date().toISOString(),
                    totpGate: {
                        secret: result.totpSecret,
                        enrolled: new Date().toISOString()
                    }
                };
            }

            this.vault = new PasswordVault([], metadata, true, result.password);
            this._sessionPassword = result.password;

            this.updateUI();
            this._notify('New vault initialized!', 'success');

            if (result.quickAction === 'add-entry') {
                setTimeout(() => this.addEntry(), 100);
            } else if (result.quickAction === 'import-csv') {
                setTimeout(() => this.importData(), 100);
            }
        } else {
            // Legacy / test mock fallback
            const pass1 = await this.modals.prompt('New Vault', 'Create Master Password:', 'password');
            if (!pass1) return;

            const pass2 = await this.modals.prompt('New Vault', 'Confirm Master Password:', 'password');
            if (pass1 !== pass2) {
                this.modals.showAlert('Error', 'Passwords do not match', 'error');
                return;
            }

            this.vault = new PasswordVault([], null, true, pass1);
            this._sessionPassword = pass1;

            await this.enrollTotpGateFlow();

            this.updateUI();
            this.modals.showAlert('Created', 'New vault created. Add entries and save.');
        }
    }

    async changeMasterPasswordFlow() {
        if (!this.vault || !this.vault.isUnlocked) return;

        const result = await this.modals.showChangePasswordModal({
            currentIterations: this.vault.metadata.kdf?.iterations || 600000,
            onBenchmark: () => KeyDerivation.benchmark()
        });

        if (!result) return;

        if (result.currentPassword !== this._sessionPassword) {
            this._notify('Current master password incorrect', 'error');
            return;
        }

        this.showLoading(true, 'Rotating master password & salt...');
        const [newVault, rotErr] = await this.vault.changeMasterPassword(result.newPassword, {
            iterations: result.iterations
        });
        this.showLoading(false);

        if (rotErr) {
            this.modals.showAlert('Error', 'Failed to change password: ' + rotErr.message, 'error');
            return;
        }

        this.vault = newVault;
        this._sessionPassword = result.newPassword;
        this.updateUI();
        this._notify('Master password and salt rotated successfully!', 'success');
    }

    async manage2FaGateFlow() {
        if (!this.vault || !this.vault.isUnlocked) return;

        const isEnrolled = !!(this.vault.metadata && this.vault.metadata.totpGate);
        const enrolledUri = isEnrolled ? `otpauth://totp/Ollie%20Vault?secret=${this.vault.metadata.totpGate.secret}` : null;

        const result = await this.modals.show2FaSettingsModal({
            isEnrolled,
            enrolledUri
        });

        if (!result) return;

        if (result.action === 'disable') {
            const confirmed = await this.modals.confirm('Are you sure you want to remove 2FA second-factor gate from this vault?');
            if (!confirmed) return;

            const [newVault, err] = await this.vault.disableTotpGate();
            if (err) {
                this.modals.showAlert('Error', 'Failed to disable 2FA: ' + err.message, 'error');
                return;
            }
            this.vault = newVault;
            this.updateUI();
            this._notify('2FA Gate disabled', 'info');
        } else if (result.action === 'enable') {
            await this.enrollTotpGateFlow();
        }
    }

    lockVault() {
        if (!this.vault) return;
        this.vault = this.vault.lock();
        this._sessionPassword = null;
        if (this.view) this.view.clearSelection();
        this.setMascotState('static');
        this.updateUI();
        this._notify('Vault locked', 'info');
    }

    async enrollTotpGateFlow() {
        const disclaimer =
            'Enable a TOTP code gate on this vault?\n\n' +
            'IMPORTANT - THIS IS NOT EXTRA ENCRYPTION:\n' +
            'Anyone who has your master password can bypass this easily. It only deters someone glancing over your shoulder or grabbing an unlocked session.\n\n' +
            'You will scan a QR once with any authenticator app and be asked for its rotating code each time the vault is opened. Enable?';
        const accepted = await this.modals.confirm(disclaimer);
        if (!accepted) return false;

        const [gate, err] = await this.vault.enableTotpGate();
        if (err) {
            this.modals.showAlert('Error', 'Could not enable TOTP gate: ' + err.message, 'error');
            return false;
        }
        this.vault = gate.vault;

        this.showQrOverlay(gate.uri);
        this.modals.showAlert(
            'TOTP Gate Enabled',
            'Scan the QR now with your authenticator app (it stays on screen until closed).\n\nEach time you open this vault you will be prompted for its rotating code.'
        );
        return true;
    }

    showQrOverlay(uri) {
        if (typeof document === 'undefined') return;
        const overlay = document.createElement('div');
        overlay.className = 'qr-overlay';
        const note = document.createElement('p');
        note.className = 'qr-uri';
        note.textContent = uri;
        overlay.appendChild(note);
        const close = document.createElement('button');
        close.className = 'btn btn-secondary';
        close.textContent = 'Close';
        close.addEventListener('click', () => overlay.remove());
        overlay.appendChild(close);

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 180;
            canvas.height = 180;
            this.modals.renderQrOnCanvas(canvas, uri);
            overlay.insertBefore(canvas, note);
        } catch { /* fallback */ }

        if (document.body && typeof document.body.appendChild === 'function') {
            document.body.appendChild(overlay);
        }
    }

    async enforceTotpGate() {
        while (this.vault && this.vault.metadata.totpGate) {
            const code = await this.modals.prompt(
                'TOTP Required',
                'Enter the current code from your authenticator:', 'text');
            if (!code) {
                this.modals.showAlert('Vault Hidden', 'Vault remains hidden until the TOTP code is provided.', 'error');
                return false;
            }
            const [res] = await this.vault.verifyTotpGate(code);
            if (res && res.valid) return true;
            this.modals.showAlert('Wrong Code', 'That code did not match. Try again.', 'error');
        }
        return true;
    }

    async addEntry() {
        const fields = [
            { name: 'title', label: 'Title', required: true },
            { name: 'username', label: 'Username' },
            { name: 'password', label: 'Password', type: 'password' },
            { name: 'url', label: 'URL', type: 'url' },
            { name: 'totp', label: 'TOTP secret or otpauth:// URI' },
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
        this._notify('Entry added successfully', 'success');
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
            { name: 'totp', label: 'TOTP secret or otpauth:// URI' },
            { name: 'tags', label: 'Tags (comma separated)' },
            { name: 'notes', label: 'Notes', type: 'textarea' }
        ];

        const initial = { ...decrypted };
        if (Array.isArray(initial.tags)) {
            initial.tags = initial.tags.join(', ');
        }

        const data = await this.modals.showForm('Edit Entry', fields, initial, { showDelete: true });
        if (!data) return;

        if (data._action === 'delete') {
            const confirmed = await this.modals.confirm('Are you sure you want to permanently delete this entry?');
            if (!confirmed) return;

            const [newVault, delErr] = this.vault.deleteEntry(id);
            if (delErr) {
                this.modals.showAlert('Error', 'Failed to delete entry: ' + delErr.message, 'error');
                return;
            }

            this.vault = newVault;
            this.updateUI();
            this._notify('Entry deleted', 'info');
            return;
        }

        this.showLoading(true, 'Encrypting...');
        const [newVault, err] = await this.vault.updateEntry(id, data);
        this.showLoading(false);

        if (err) {
            this.modals.showAlert('Error', 'Failed to edit entry: ' + err.message, 'error');
            return;
        }

        this.vault = newVault;
        this.updateUI();
        this._notify('Entry updated', 'success');
    }

    async saveVault() {
        if (!this.vault.isUnlocked || !this._sessionPassword) return;

        try {
            const confirmed = await this.modals.confirm(
                'Select a folder with JPEG images.\n\n' +
                'The vault data will be hidden inside these images.\n' +
                'Existing functionality in these images will remain, but they will be modified.'
            );
            if (!confirmed) return;

            let handles = [];

            if (this.droppedHandles && this.droppedHandles.size > 0) {
                console.log('Using dropped handles for saving...');
                handles = Array.from(this.droppedHandles.values());
            } else {
                try {
                    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                    handles = await FileScanner.getJpegHandles(dirHandle);
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    throw err;
                }
            }

            if (handles.length === 0) {
                this.modals.showAlert('Error', 'No JPEG (.jpg / .jpeg) carrier images were found in the selected folder.', 'error');
                return;
            }

            // Check write permissions eagerly while we have fresh user activation
            for (const h of handles) {
                if (typeof h.queryPermission === 'function') {
                    let perm = await h.queryPermission({ mode: 'readwrite' });
                    if (perm !== 'granted' && typeof h.requestPermission === 'function') {
                        perm = await h.requestPermission({ mode: 'readwrite' });
                    }
                    if (perm !== 'granted') {
                        this.modals.showAlert('Error', `Write permission denied for ${h.name || 'carrier image'}`, 'error');
                        return;
                    }
                }
            }

            this.showLoading(true, 'Embedding vault in images...');

            const fileObjs = [];
            for (const h of handles) {
                fileObjs.push(await h.getFile());
            }

            const [results, saveErr] = await this.vault.save(fileObjs, this._sessionPassword);
            if (saveErr) {
                this.showLoading(false);
                this.modals.showAlert('Error', 'Failed to embed vault: ' + saveErr.message, 'error');
                return;
            }

            const resultsMap = new Map();
            for (const r of results) resultsMap.set(r.name, r.data);

            const writeTasks = [];
            for (const h of handles) {
                if (resultsMap.has(h.name)) {
                    writeTasks.push({ handle: h, data: resultsMap.get(h.name) });
                }
            }

            const [, writeErr] = await writeAllWithRollback(writeTasks);
            if (writeErr) {
                this.showLoading(false);
                this.modals.showAlert('Error', 'Failed to save modified images: ' + writeErr.message, 'error');
                return;
            }

            this.showLoading(false);
            this._notify(`Vault embedded across ${results.length} carrier images!`, 'success');

            const refreshedFileObjs = [];
            for (const h of handles) {
                refreshedFileObjs.push(await h.getFile());
            }

            const [scanResult, scanErr] = await CapacityScanner.scan(refreshedFileObjs, {
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

    async rasterizeToImageData(file) {
        if (file && file.imageData) return file.imageData;
        if (typeof createImageBitmap !== 'function') {
            throw new Error('QR image capture requires a browser canvas');
        }
        const bmp = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        bmp.close && bmp.close();
        return imageData;
    }

    async handleScanQrFile({ id, file }) {
        if (!id || !file) return;
        try {
            const imageData = await this.rasterizeToImageData(file);
            await this.applyScannedImage(id, imageData);
        } catch (err) {
            this.modals.showAlert('QR Scan Failed', err.message, 'error');
        }
    }

    async applyScannedImage(entryId, imageData) {
        if (!this.vault || !this.vault.isUnlocked) return;

        const [decoded, decodeErr] = decodeQR(imageData);
        if (decodeErr) {
            this.modals.showAlert('QR Scan Failed', 'Could not read a QR code from that image: ' + decodeErr.message, 'error');
            return;
        }

        const text = new TextDecoder().decode(decoded.bytes).trim();
        if (!/^otpauth:\/\//i.test(text)) {
            this.modals.showAlert('Not a TOTP Code', 'The scanned QR does not contain an otpauth:// login secret.', 'error');
            return;
        }

        const entry = this.vault.entries.find(e => e.id === entryId);
        const [normalized] = normalizeTotpInput(text, entry ? entry.title : '');

        const [newVault, updateErr] = await this.vault.updateEntry(entryId, { totp: normalized });
        if (updateErr) {
            this.modals.showAlert('Error', 'Failed to update entry with TOTP: ' + updateErr.message, 'error');
            return;
        }

        this.vault = newVault;
        this.updateUI();
        this._notify('TOTP secret added to entry', 'success');
    }

    async copyPassword(id) {
        if (!this.vault.isUnlocked) return;

        const entry = this.vault.entries.find(e => e.id === id);
        if (!entry) return;

        const [sessionKey, kErr] = await this.vault._getSessionKey();
        if (kErr || !sessionKey) {
            this.modals.showAlert('Error', 'Cannot copy: vault key error', 'error');
            return;
        }

        const [decrypted, decErr] = await entry.decrypt(sessionKey);
        if (decErr || !decrypted) {
            this.modals.showAlert('Error', 'Cannot copy: failed to decrypt entry', 'error');
            return;
        }

        if (!decrypted.password) {
            this._notify('No password set for this entry', 'warn');
            return;
        }

        this.copyToClipboardWithAutoClear(decrypted.password, 'Password');
    }

    async importData() {
        if (!this.vault.isUnlocked) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.csv,.txt,.ollie';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                this.showLoading(true, 'Reading file...');
                const text = await file.text();

                // Check for encrypted backup
                try {
                    const parsed = JSON.parse(text);
                    if (parsed.format === 'ollie-export') {
                        const pass = await this.modals.prompt('Encrypted Backup', 'Enter backup envelope password:', 'password');
                        if (!pass) {
                            this.showLoading(false);
                            return;
                        }
                        const [importedVault, impErr] = await PasswordVault.importEncrypted(text, pass);
                        this.showLoading(false);
                        if (impErr) {
                            this.modals.showAlert('Import Failed', impErr.message, 'error');
                            return;
                        }
                        this.vault = importedVault;
                        this._sessionPassword = pass;
                        this.updateUI();
                        this.modals.showAlert('Import Complete', `Restored ${importedVault.entries.length} entries from backup!`);
                        return;
                    } else if (Array.isArray(parsed.entries)) {
                        // Plain JSON export
                        let currentVault = this.vault;
                        let addedCount = 0;
                        for (const rawEntry of parsed.entries) {
                            const [updatedVault, addErr] = await currentVault.addEntry(rawEntry);
                            if (!addErr) {
                                currentVault = updatedVault;
                                addedCount++;
                            }
                        }
                        this.vault = currentVault;
                        this.showLoading(false);
                        this.updateUI();
                        this.modals.showAlert('Import Complete', `Imported ${addedCount} of ${parsed.entries.length} items.`);
                        return;
                    }
                } catch { /* not JSON */ }

                // CSV / vendor import
                const [csvResult, parseErr] = await importFromCsv(text);
                if (parseErr) {
                    this.showLoading(false);
                    this.modals.showAlert('Error', 'Failed to parse CSV data: ' + parseErr.message, 'error');
                    return;
                }

                const entries = csvResult ? csvResult.entries : [];
                if (!entries || entries.length === 0) {
                    this.showLoading(false);
                    this.modals.showAlert('Import', 'No valid entries found in the file.');
                    return;
                }

                this.showLoading(true, `Importing ${entries.length} items...`);

                let currentVault = this.vault;
                let addedCount = 0;
                for (const rawEntry of entries) {
                    const [updatedVault, addErr] = await currentVault.addEntry(rawEntry);
                    if (addErr) {
                        console.warn('Skipping entry import due to error:', addErr, rawEntry);
                        continue;
                    }
                    currentVault = updatedVault;
                    addedCount++;
                }

                this.vault = currentVault;
                this.showLoading(false);
                this.updateUI();
                this.modals.showAlert('Import Complete', `Imported ${addedCount} of ${entries.length} items.`);

            } catch (err) {
                this.showLoading(false);
                this.modals.showAlert('Error', 'Failed to read import file: ' + err.message, 'error');
            }
        };

        input.click();
    }

    async exportEncryptedData() {
        if (!this.vault.isUnlocked) return;

        this.showLoading(true, 'Packaging encrypted backup...');
        const [envelopeJson, err] = await this.vault.exportEncrypted(this._sessionPassword);
        this.showLoading(false);

        if (err) {
            this.modals.showAlert('Error', 'Export failed: ' + err.message, 'error');
            return;
        }

        const blob = new Blob([envelopeJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ollie-backup-${new Date().toISOString().split('T')[0]}.ollie.json`;
        a.click();
        URL.revokeObjectURL(url);
        this._notify('Encrypted backup downloaded', 'success');
    }

    async exportData() {
        if (!this.vault.isUnlocked) return;

        // Master password re-authentication gate
        const enteredPassword = await this.modals.prompt(
            'Verify Master Password',
            'Plaintext Export: Re-enter your master password to authorize unencrypted export:',
            'password'
        );
        if (!enteredPassword) return;

        if (enteredPassword !== this._sessionPassword) {
            this._notify('Master password verification failed. Export cancelled.', 'error');
            return;
        }

        const warningMsg = '⚠️ SECURITY WARNING: Plaintext Export\n\n' +
            'You are about to export your entire vault in PLAINTEXT. All passwords will be saved in an unencrypted JSON file on your computer.\n\n' +
            'Anyone with access to this file can view all your passwords.\n\n' +
            'Are you sure you want to proceed?';

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
        this._notify('Plaintext export downloaded', 'info');
    }

    getVaultSize() {
        if (!this.vault) return 0;

        const stateKey = `${this.vault.metadata?.modified || ''}-${this.vault.entries.length}-${this.vault.metadata?.revision || 0}`;
        if (this._vaultSizeCacheKey === stateKey) {
            return this._vaultSizeCache;
        }

        try {
            const vaultData = JSON.stringify({
                metadata: this.vault.metadata,
                entries: this.vault.entries.map(e => e.toJSON())
            });
            const size = new TextEncoder().encode(vaultData).length;
            this._vaultSizeCache = size;
            this._vaultSizeCacheKey = stateKey;
            return size;
        } catch {
            return 0;
        }
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 bytes';
        const k = 1024;
        const sizes = ['bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const val = (bytes / Math.pow(k, i));
        const valStr = Number.isInteger(val) ? val.toString() : val.toFixed(2);
        return valStr + ' ' + (i === 0 ? 'bytes' : sizes[i]);
    }

    updateUI() {
        this.updateState();
        this.renderTags();

        if (this.view) {
            const entries = this.vault.search(this.currentQuery, Array.from(this.activeTags));

            if (this.currentSort === 'newest') {
                entries.sort((a, b) => new Date(b.modified) - new Date(a.modified));
            } else if (this.currentSort === 'oldest') {
                entries.sort((a, b) => new Date(a.modified) - new Date(b.modified));
            } else if (this.currentSort === 'az') {
                entries.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            } else if (this.currentSort === 'za') {
                entries.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
            }

            this.view.render(entries);
        }
    }

    updateState() {
        const importBtn = document.getElementById('importBtn');
        const exportBtn = document.getElementById('exportBtn');
        const lockBtn = document.getElementById('lockBtn');
        const changePwBtn = document.getElementById('changePwBtn');
        const totpSettingsBtn = document.getElementById('totpSettingsBtn');
        const exportEncryptedBtn = document.getElementById('exportEncryptedBtn');
        const addBtn = document.getElementById('addBtn');
        const saveBtn = document.getElementById('saveBtn');
        const statusText = document.getElementById('statusText');
        const itemCount = document.getElementById('itemCount');
        const capacityText = document.getElementById('capacityText');

        if (typeof document !== 'undefined' && document.body && document.body.classList) {
            document.body.classList.toggle('vault-unlocked', !!(this.vault && this.vault.isUnlocked));
        }

        const isUnlocked = this.vault && this.vault.isUnlocked;

        if (importBtn) importBtn.style.display = isUnlocked ? 'block' : 'none';
        if (exportBtn) exportBtn.style.display = isUnlocked ? 'block' : 'none';
        if (lockBtn) lockBtn.style.display = isUnlocked ? 'block' : 'none';
        if (changePwBtn) changePwBtn.style.display = isUnlocked ? 'block' : 'none';
        if (totpSettingsBtn) totpSettingsBtn.style.display = isUnlocked ? 'block' : 'none';
        if (exportEncryptedBtn) exportEncryptedBtn.style.display = isUnlocked ? 'block' : 'none';
        if (addBtn) addBtn.disabled = !isUnlocked;
        if (saveBtn) saveBtn.disabled = !isUnlocked;

        if (isUnlocked) {
            const filteredResults = this.vault.search(this.currentQuery, Array.from(this.activeTags));
            if (itemCount) itemCount.textContent = `${filteredResults.length} Items`;

            if (capacityText) {
                const usedSize = this.getVaultSize();
                const usedStr = this.formatSize(usedSize);
                const totalStr = this.formatSize(this.totalCapacity || 0);
                const dirSize = this.totalDirectoryBytes || 0;
                const dirStr = this.formatSize(dirSize);

                capacityText.textContent = `Used: ${usedStr} / Total: ${totalStr}`;

                const stegoPercent = dirSize > 0 ? (this.totalCapacity / dirSize) * 100 : 0;
                const vaultStegoPercent = this.totalCapacity > 0 ? Math.min(100, (usedSize / this.totalCapacity) * 100) : 0;
                const vaultDirPercent = dirSize > 0 ? (usedSize / dirSize) * 100 : 0;

                capacityText.title = dirSize > 0
                    ? `Carrier Directory: ${dirStr}\nStego Capacity: ${totalStr} (${stegoPercent.toFixed(2)}% of directory)\nVault Payload: ${usedStr} (${vaultStegoPercent.toFixed(1)}% of stego, ${vaultDirPercent.toFixed(3)}% of directory)`
                    : `Vault currently uses ${usedStr} of ${totalStr} available space.`;

                const progressEl = document.getElementById('capacityProgress');
                if (progressEl) {
                    progressEl.style.width = `${vaultStegoPercent}%`;
                    progressEl.classList.remove('warning', 'danger');
                    if (vaultStegoPercent > 90) progressEl.classList.add('danger');
                    else if (vaultStegoPercent > 75) progressEl.classList.add('warning');
                }

                const vaultProgressEl = document.getElementById('vaultProgress');
                if (vaultProgressEl) {
                    vaultProgressEl.style.width = `${Math.min(100, Math.max(0, vaultDirPercent))}%`;
                }
            }

            if (statusText) {
                const savedDate = this.vault.metadata.modified
                    ? new Date(this.vault.metadata.modified).toISOString().slice(0, 16).replace('T', ' ')
                    : 'unknown';
                statusText.textContent = `Unlocked · Rev ${this.vault.metadata.revision} · ${savedDate} UTC`;
            }

            this.populateTotpCodes(filteredResults);
        } else {
            if (statusText) statusText.textContent = 'Locked';
            this.stopTotpRefresh();
        }
    }

    async populateTotpCodes(entries) {
        this.stopTotpRefresh();
        if (!this.vault || !this.vault.isUnlocked) return;

        const [sessionKey, , keyErr] = await this.vault._getSessionKey();
        if (keyErr) {
            logger.warn(`TOTP display skipped: session key unavailable (${keyErr.message})`);
            return;
        }
        if (!sessionKey) return;

        this._totpEntries = [];
        for (const entry of entries) {
            if (!entry.decrypt) continue;
            const [plain, decErr] = await entry.decrypt(sessionKey);
            if (decErr || !plain || !plain.totp) continue;

            const [code, codeErr] = await codeFromOtpauthUri(plain.totp);
            if (codeErr || !code) {
                logger.warn(`TOTP for entry ${entry.id}: ${codeErr ? codeErr.message : 'no code generated'}`);
                continue;
            }

            this._totpEntries.push({ id: entry.id, uri: plain.totp });

            const slot = document.querySelector(`[data-entry-id="${entry.id}"] .totp-slot`);
            if (!slot) continue;
            const escapedCode = `${code.slice(0, 3)} ${code.slice(3)}`;
            slot.innerHTML =
                `<button class="totp-code" data-code="${escapedCode}" title="Copy one-time code">${escapedCode}</button>` +
                `<span class="totp-countdown"></span>`;
            const button = slot.querySelector('.totp-code');
            if (button && navigator.clipboard && navigator.clipboard.writeText) {
                button.addEventListener('click', () => {
                    navigator.clipboard.writeText(button.dataset.code);
                    button.classList.add('copied');
                    setTimeout(() => button.classList.remove('copied'), 800);
                });
            }
        }

        if (this._totpEntries.length > 0) {
            this.startTotpRefresh();
        }
    }

    startTotpRefresh() {
        if (this._totpTimer) return;
        this._totpTimer = setInterval(() => this._totpTick(Date.now() / 1000), 1000);
    }

    stopTotpRefresh() {
        if (this._totpTimer !== null && this._totpTimer !== undefined) {
            clearInterval(this._totpTimer);
            this._totpTimer = null;
        }
        this._totpEntries = [];
    }

    async _totpTick(nowSeconds) {
        if (!this._totpEntries || this._totpEntries.length === 0) return;
        for (const record of this._totpEntries) {
            const slot = document.querySelector(`[data-entry-id="${record.id}"] .totp-slot`);
            if (!slot || typeof slot.querySelector !== 'function') continue;

            const [code, codeErr] = await codeFromOtpauthUri(record.uri, { now: nowSeconds });
            if (codeErr || !code) {
                logger.warn(`TOTP refresh failed for entry ${record.id}: ${codeErr ? codeErr.message : 'empty code'}`);
                continue;
            }

            const label = `${code.slice(0, 3)} ${code.slice(3)}`;
            const button = slot.querySelector('.totp-code');
            if (button) {
                button.textContent = label;
                button.dataset.code = code;
            }

            const countdown = slot.querySelector('.totp-countdown');
            if (countdown) {
                const remaining = 30 - (Math.floor(nowSeconds) % 30);
                countdown.textContent = `${remaining}s`;
            }

            // Also keep detailPane in sync if this entry is currently selected
            const detailPane = document.getElementById('detailPane');
            if (detailPane && this.view && this.view.selectedId === record.id) {
                const detailCode = detailPane.querySelector('.detail-totp-code');
                const detailCount = detailPane.querySelector('.detail-totp-countdown');
                if (detailCode) {
                    detailCode.textContent = label;
                }
                if (detailCount) {
                    const remaining = 30 - (Math.floor(nowSeconds) % 30);
                    detailCount.textContent = `${remaining}s`;
                }
            }
        }
    }

    renderTags() {
        const tagList = document.getElementById('tagList');
        if (!tagList) return;

        const tagCounts = new Map();
        if (this.vault && this.vault.entries) {
            this.vault.entries.forEach(e => {
                if (e.tags && Array.isArray(e.tags)) {
                    e.tags.forEach(t => {
                        const trimmed = String(t).trim();
                        if (trimmed) {
                            tagCounts.set(trimmed, (tagCounts.get(trimmed) || 0) + 1);
                        }
                    });
                }
            });
        }

        const tagCountBadge = document.getElementById('tagCountBadge');
        if (tagCountBadge) {
            tagCountBadge.textContent = String(tagCounts.size);
        }

        const clearTagsBtn = document.getElementById('clearTagsBtn');
        if (clearTagsBtn) {
            if (this.activeTags.size > 0) {
                clearTagsBtn.style.display = 'inline-block';
                clearTagsBtn.textContent = `✕ Clear (${this.activeTags.size})`;
            } else {
                clearTagsBtn.style.display = 'none';
            }
        }

        if (tagCounts.size === 0) {
            tagList.innerHTML = '';
            return;
        }

        tagList.innerHTML = '';
        const sortedTags = [...tagCounts.keys()].sort((a, b) => {
            const isDesc = this.tagSortDir !== 'asc';
            if (this.tagSortMode === 'az') {
                return isDesc ? a.localeCompare(b) : b.localeCompare(a);
            }
            const countA = tagCounts.get(a) || 0;
            const countB = tagCounts.get(b) || 0;
            const diff = isDesc ? countB - countA : countA - countB;
            return diff !== 0 ? diff : a.localeCompare(b);
        });
        const filterQuery = (this.tagSearchQuery || '').toLowerCase();

        let visibleCount = 0;
        sortedTags.forEach(tag => {
            if (filterQuery && !tag.toLowerCase().includes(filterQuery)) {
                return;
            }
            visibleCount++;
            const count = tagCounts.get(tag);
            const isActive = this.activeTags.has(tag);
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `tag-pill ${isActive ? 'active' : ''}`;
            pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            pill.setAttribute('aria-label', `Tag ${tag}, ${count} entries`);
            pill.innerHTML = `<span>#${escapeHtml(tag)}</span> <span class="pill-count">${count}</span>`;
            pill.onclick = () => {
                if (this.activeTags.has(tag)) {
                    this.activeTags.delete(tag);
                } else {
                    this.activeTags.add(tag);
                }
                this.updateUI();
            };
            tagList.appendChild(pill);
        });

        if (visibleCount === 0 && filterQuery) {
            tagList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No matching tags</span>';
        }
    }

    setViewMode(mode) {
        if (!['sidebar', 'card', 'both'].includes(mode)) return;
        this.viewMode = mode;
        if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem('ollie-view-mode', mode); } catch (_) {}
        }

        const modeBtns = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
            ? document.querySelectorAll('.view-mode-btn')
            : [];
        modeBtns.forEach(b => {
            if (b.classList) b.classList.toggle('active', b.dataset.mode === mode);
        });

        this._updateViewModeClasses();

        if (this.view) {
            this.view.setViewMode(mode);
        }

        const detailPane = document.getElementById('detailPane');
        if (detailPane) {
            if (mode === 'card') {
                detailPane.style.display = 'none';
                if (detailPane.classList) detailPane.classList.remove('is-open');
            } else if (mode === 'both') {
                detailPane.style.display = 'flex';
                if (detailPane.classList) detailPane.classList.add('is-open');
                if (this.view && this.view.selectedId) {
                    this.handleEntrySelected({ id: this.view.selectedId, viewMode: mode });
                } else {
                    this._renderDetailPlaceholder();
                }
            } else {
                // sidebar
                if (!this.view || !this.view.selectedId) {
                    detailPane.style.display = 'none';
                    if (detailPane.classList) detailPane.classList.remove('is-open');
                } else {
                    this.handleEntrySelected({ id: this.view.selectedId, viewMode: mode });
                }
            }
        }
    }

    _updateViewModeClasses() {
        const dropZone = document.getElementById('dropZone');
        if (dropZone && dropZone.classList) {
            dropZone.classList.remove('view-mode-sidebar', 'view-mode-card', 'view-mode-both');
            dropZone.classList.add(`view-mode-${this.viewMode}`);
        }
    }

    _renderDetailPlaceholder() {
        const detailPane = document.getElementById('detailPane');
        if (!detailPane) return;
        detailPane.innerHTML = `
            <div class="detail-pane-placeholder">
                <div class="placeholder-icon">👈</div>
                <h3>No Entry Selected</h3>
                <p>Select a card from the list to view its credentials and details.</p>
            </div>
        `;
    }

    async handleEntrySelected({ id, viewMode, automata, targetCard }) {
        const detailPane = document.getElementById('detailPane');
        if (!id || !this.vault || !this.vault.isUnlocked) {
            if (detailPane) {
                if (viewMode === 'both') {
                    detailPane.style.display = 'flex';
                    if (detailPane.classList) detailPane.classList.add('is-open');
                    this._renderDetailPlaceholder();
                } else {
                    detailPane.style.display = 'none';
                    if (detailPane.classList) detailPane.classList.remove('is-open');
                    detailPane.innerHTML = '';
                }
            }
            return;
        }

        const secureEntry = this.vault.entries.find(e => e.id === id);
        if (!secureEntry) return;

        const [sessionKey, , kErr] = await this.vault._getSessionKey();
        if (kErr || !sessionKey) return;

        const [decrypted, decErr] = await secureEntry.decrypt(sessionKey);
        if (decErr || !decrypted) return;

        // In 'card' or 'both' mode: populate card's expanded notes and metadata
        if (viewMode === 'card' || viewMode === 'both') {
            const cardEl = document.querySelector(`[data-entry-id="${id}"]`);
            if (cardEl) {
                const notesSlot = cardEl.querySelector('.expanded-notes-slot');
                if (notesSlot) {
                    notesSlot.innerHTML = decrypted.notes
                        ? `<div class="card-notes-preview"><strong>Notes:</strong><p>${escapeHtml(decrypted.notes)}</p></div>`
                        : '<div class="card-notes-preview text-muted"><em>No notes recorded</em></div>';
                }
                const metaSlot = cardEl.querySelector('.expanded-meta-slot');
                if (metaSlot) {
                    const modDate = decrypted.modified ? new Date(decrypted.modified).toLocaleDateString() : '';
                    metaSlot.innerHTML = `<span class="card-meta-text">Modified: ${escapeHtml(modDate)}</span>`;
                }
            }
        }

        // In 'sidebar' or 'both' mode: populate and display right detail pane
        if ((viewMode === 'sidebar' || viewMode === 'both') && detailPane) {
            const escape = (str) => escapeHtml(str);
            const hasUrl = !!(decrypted.url && decrypted.url.trim());
            const hasTotp = !!(decrypted.totp && decrypted.totp.trim());

            detailPane.innerHTML = `
                <div class="detail-pane-header">
                    <div class="detail-pane-title-group">
                        <span class="detail-icon">${VaultView.getIcon(decrypted)}</span>
                        <div>
                            <h3 class="detail-title">${escape(decrypted.title || 'Untitled')}</h3>
                            <span class="detail-subtitle">${escape(decrypted.username || 'No username')}</span>
                        </div>
                    </div>
                    <button type="button" class="btn-icon detail-close-btn" aria-label="Close Inspector">✕</button>
                </div>

                <div class="detail-pane-body">
                    <div class="detail-section">
                        <label class="detail-label">Username</label>
                        <div class="detail-row">
                            <span class="detail-value mono">${escape(decrypted.username || '—')}</span>
                            ${decrypted.username ? `<button type="button" class="btn-icon copy-user-btn" title="Copy username">📋</button>` : ''}
                        </div>
                    </div>

                    <div class="detail-section">
                        <label class="detail-label">Password</label>
                        <div class="detail-row">
                            <input type="password" readonly class="detail-password-input mono" value="${escape(decrypted.password || '')}">
                            <button type="button" class="btn-icon toggle-detail-pw-btn" title="Show/Hide password">👁</button>
                            <button type="button" class="btn-icon copy-detail-pw-btn" title="Copy password">📋</button>
                        </div>
                    </div>

                    ${hasTotp ? `
                    <div class="detail-section">
                        <label class="detail-label">Two-Factor Authentication (TOTP)</label>
                        <div class="detail-totp-container">
                            <button type="button" class="detail-totp-code mono" title="Click to copy code">------</button>
                            <span class="detail-totp-countdown">--s</span>
                        </div>
                    </div>` : ''}

                    ${hasUrl ? `
                    <div class="detail-section">
                        <label class="detail-label">Website</label>
                        <div class="detail-row">
                            <span class="detail-value url-text">${escape(decrypted.url)}</span>
                            <button type="button" class="btn-icon launch-url-btn" title="Open website in new tab">↗</button>
                        </div>
                    </div>` : ''}

                    <div class="detail-section">
                        <label class="detail-label">Notes</label>
                        <div class="detail-notes-box">
                            ${decrypted.notes ? `<pre class="detail-notes-text">${escape(decrypted.notes)}</pre>` : '<span class="text-muted"><em>No notes</em></span>'}
                        </div>
                    </div>

                    <div class="detail-section">
                        <label class="detail-label">Tags</label>
                        <div class="detail-tags-list">
                            ${(decrypted.tags || []).length > 0
                                ? (decrypted.tags || []).map(t => `<button type="button" class="tag detail-tag-pill" data-tag="${escape(t)}">#${escape(t)}</button>`).join('')
                                : '<span class="text-muted"><em>No tags</em></span>'}
                        </div>
                    </div>

                    <div class="detail-section detail-meta-section">
                        <span class="detail-meta-line">Created: ${decrypted.created ? new Date(decrypted.created).toLocaleString() : '—'}</span>
                        <span class="detail-meta-line">Modified: ${decrypted.modified ? new Date(decrypted.modified).toLocaleString() : '—'}</span>
                        <span class="detail-meta-line">Revision: ${escape(String(decrypted.revision || this.vault.metadata?.revision || 0))}</span>
                    </div>
                </div>

                <div class="detail-pane-footer">
                    <button type="button" class="btn btn-secondary detail-edit-btn">✏️ Edit</button>
                    <button type="button" class="btn btn-danger detail-delete-btn">🗑️ Delete</button>
                </div>
            `;

            detailPane.style.display = 'flex';
            if (detailPane.classList) detailPane.classList.add('is-open');

            const closeBtn = detailPane.querySelector('.detail-close-btn');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    if (this.view) this.view.clearSelection();
                };
            }

            const copyUserBtn = detailPane.querySelector('.copy-user-btn');
            if (copyUserBtn && decrypted.username) {
                copyUserBtn.onclick = () => this.copyToClipboardWithAutoClear(decrypted.username, 'Username');
            }

            const togglePwBtn = detailPane.querySelector('.toggle-detail-pw-btn');
            const pwInput = detailPane.querySelector('.detail-password-input');
            if (togglePwBtn && pwInput) {
                togglePwBtn.onclick = () => {
                    if (pwInput.type === 'password') {
                        pwInput.type = 'text';
                        togglePwBtn.textContent = '🙈';
                    } else {
                        pwInput.type = 'password';
                        togglePwBtn.textContent = '👁';
                    }
                };
            }

            const copyPwBtn = detailPane.querySelector('.copy-detail-pw-btn');
            if (copyPwBtn && decrypted.password) {
                copyPwBtn.onclick = () => this.copyToClipboardWithAutoClear(decrypted.password, 'Password');
            }

            const launchBtn = detailPane.querySelector('.launch-url-btn');
            if (launchBtn && decrypted.url) {
                launchBtn.onclick = () => {
                    if (!isSafeHttpUrl(decrypted.url)) {
                        this.events.emit('unsafe-url-blocked', { id, url: decrypted.url });
                        return;
                    }
                    window.open(decrypted.url, '_blank', 'noopener,noreferrer');
                };
            }

            const tagPills = (detailPane && typeof detailPane.querySelectorAll === 'function')
                ? detailPane.querySelectorAll('.detail-tag-pill')
                : [];
            tagPills.forEach(pill => {
                pill.onclick = () => {
                    const tag = pill.dataset.tag;
                    if (tag) {
                        this.activeTags.clear();
                        this.activeTags.add(tag);
                        this.updateUI();
                    }
                };
            });

            const editBtn = detailPane.querySelector('.detail-edit-btn');
            if (editBtn) {
                editBtn.onclick = () => this.editEntry(id);
            }

            const deleteBtn = detailPane.querySelector('.detail-delete-btn');
            if (deleteBtn) {
                deleteBtn.onclick = async () => {
                    const confirmed = await this.modals.confirm('Are you sure you want to permanently delete this entry?');
                    if (!confirmed) return;
                    const [newVault, delErr] = this.vault.deleteEntry(id);
                    if (delErr) {
                        this.modals.showAlert('Error', 'Failed to delete entry: ' + delErr.message, 'error');
                        return;
                    }
                    this.vault = newVault;
                    if (this.view) this.view.clearSelection();
                    this.updateUI();
                    this._notify('Entry deleted', 'info');
                };
            }

            if (hasTotp) {
                this._updateDetailTotp(decrypted.totp);
            }
        }

        // Post-async layout settlement via CardFlowAutomata to eliminate secondary layout drift
        const currentAutomata = automata || (this.view && this.view.automata);
        const cardElement = targetCard || (id ? document.querySelector(`[data-entry-id="${id}"]`) : null);
        if (currentAutomata && cardElement) {
            currentAutomata.settle(cardElement);
        }
    }

    async _updateDetailTotp(uri) {
        const detailPane = document.getElementById('detailPane');
        if (!detailPane) return;
        const codeBtn = detailPane.querySelector('.detail-totp-code');
        const countdown = detailPane.querySelector('.detail-totp-countdown');
        if (!codeBtn) return;

        const [code, err] = await codeFromOtpauthUri(uri);
        if (!err && code) {
            const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
            codeBtn.textContent = formatted;
            codeBtn.onclick = () => this.copyToClipboardWithAutoClear(code, 'TOTP code');
            if (countdown) {
                const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
                countdown.textContent = `${remaining}s`;
            }
        }
    }

    copyToClipboardWithAutoClear(text, label = 'Secret') {
        if (!text) return;
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            this._lastCopiedSecret = text;
            this._notify(`${label} copied! Auto-clearing in 30s...`, 'success');

            if (this._clipboardTimer) {
                clearTimeout(this._clipboardTimer);
            }

            this._clipboardTimer = setTimeout(async () => {
                try {
                    if (navigator.clipboard.readText) {
                        const current = await navigator.clipboard.readText();
                        if (current === this._lastCopiedSecret) {
                            await navigator.clipboard.writeText('');
                            this._notify('Clipboard auto-cleared for security.', 'info');
                        }
                    } else {
                        await navigator.clipboard.writeText('');
                    }
                } catch (_) {}
                this._lastCopiedSecret = null;
                this._clipboardTimer = null;
            }, 30000);
        } else {
            this.modals.showAlert(label, text);
        }
    }

    handleKeyDown(e) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

        if (e.key === 'Escape') {
            if (this.view && this.view.selectedId) {
                this.view.clearSelection();
                return;
            }
            if (this.modals && typeof this.modals.hide === 'function') {
                this.modals.hide();
            }
            return;
        }

        if (isInput) return;

        if (e.key === '/') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput && typeof searchInput.focus === 'function') searchInput.focus();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
            e.preventDefault();
            this.addEntry();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            this.saveVault();
            return;
        }

        if (e.key === '?') {
            e.preventDefault();
            this.modals.showShortcutsModal();
            return;
        }

        const entries = this.vault && this.vault.isUnlocked
            ? this.vault.search(this.currentQuery, Array.from(this.activeTags))
            : [];
        if (!entries.length || !this.view) return;

        if (e.key === 'j' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            const currentIdx = entries.findIndex(ent => ent.id === this.view.selectedId);
            const nextIdx = currentIdx < entries.length - 1 ? currentIdx + 1 : 0;
            this.view.selectEntry(entries[nextIdx].id, false);
            return;
        }

        if (e.key === 'k' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const currentIdx = entries.findIndex(ent => ent.id === this.view.selectedId);
            const prevIdx = currentIdx > 0 ? currentIdx - 1 : entries.length - 1;
            this.view.selectEntry(entries[prevIdx].id, false);
            return;
        }

        if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey) {
            if (this.view.selectedId) {
                e.preventDefault();
                this.copyPassword(this.view.selectedId);
            }
            return;
        }

        if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
            if (this.view.selectedId) {
                e.preventDefault();
                this._copySelectedTotp(this.view.selectedId);
            }
            return;
        }
    }

    async _copySelectedTotp(id) {
        if (!this.vault || !this.vault.isUnlocked) return;
        const entry = this.vault.entries.find(e => e.id === id);
        if (!entry) return;
        const [sessionKey] = await this.vault._getSessionKey();
        if (!sessionKey) return;
        const [decrypted] = await entry.decrypt(sessionKey);
        if (!decrypted || !decrypted.totp) return;
        const [code] = await codeFromOtpauthUri(decrypted.totp);
        if (code) {
            this.copyToClipboardWithAutoClear(code, 'TOTP code');
        }
    }

    setMascotState(state) {
        this.mascotState = state;
        const mascotFiles = {
            static: 'components/assets/ollie-static.svg',
            animated: 'components/assets/ollie-animated.svg',
            thinking: 'components/assets/ollie-thinking.svg',
            happy: 'components/assets/ollie-happy.svg',
            sad: 'components/assets/ollie-sad.svg'
        };
        const src = mascotFiles[state] || mascotFiles.static;
        if (typeof document === 'undefined') return;
        const sidebarLogo = document.getElementById('sidebarLogo');
        if (sidebarLogo) sidebarLogo.src = src;
        const emptyMascot = document.getElementById('emptyMascot');
        if (emptyMascot) emptyMascot.src = src;
        const loadingMascot = document.querySelector('#loadingOverlay img');
        if (loadingMascot && state === 'thinking') loadingMascot.src = src;
    }

    showLoading(show, message = 'Processing...') {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
            const text = overlay.querySelector('p');
            if (text) text.textContent = message;
        }
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        new VaultUI();
    });
}
