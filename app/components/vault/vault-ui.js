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
        this.totalCapacity = 0;
        this._vaultSizeCache = 0;
        this._vaultSizeCacheKey = '';

        this.initialize();
    }

    initialize() {
        // Drop Zone
        const dropEl = document.getElementById('dropZone');
        if (dropEl) {
            new DropZone(dropEl, (files) => this.handleFilesDropped(files));
        }

        // View
        const viewEl = document.getElementById('vaultList');
        if (viewEl) {
            this.view = new VaultView(viewEl, this.events);
        }

        // Bind Events
        this.events.on('edit-entry', (e) => this.editEntry(e));
        this.events.on('scan-qr-file', (e) => this.handleScanQrFile(e));
        this.events.on('copy-password', (p) => this.copyPassword(p));
        this.events.on('unsafe-url-blocked', () => {
            this.modals.showAlert('Blocked', 'That entry URL uses an unsupported scheme. Only http(s) links can be opened.', 'error');
        });

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

        for (const item of items) {
            if (item.kind === 'file' && item.getFile) {
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
                if (item.name && (FileScanner.matchesPattern(item.name, '*.jpg') || FileScanner.matchesPattern(item.name, '*.jpeg'))) {
                    filesToLoad.push(item);
                } else if (!item.name && (item.type === 'image/jpeg' || item.type === 'image/jpg')) {
                    filesToLoad.push(item);
                }
            }
        }

        if (filesToLoad.length === 0) {
            this.modals.showAlert('No Carriers Found', 'No JPEG (.jpg / .jpeg) carrier images were found in the dropped files or folders. Only JPEG images can be used.', 'error');
            return;
        }

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
            this._sessionPassword = password;
            const gateOk = await this.enforceTotpGate();
            if (!gateOk) {
                this.vault = null;
                this.updateUI();
                return;
            }
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

        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(decrypted.password);
            this._notify('Password copied to clipboard', 'success');
        } else {
            this.modals.showAlert('Password', decrypted.password);
        }
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
                capacityText.textContent = `Used: ${usedStr} / Total: ${totalStr}`;
                capacityText.title = `Vault currently uses ${usedStr} of ${totalStr} available space.`;

                const progressEl = document.getElementById('capacityProgress');
                if (progressEl) {
                    const percent = this.totalCapacity > 0 ? Math.min(100, (usedSize / this.totalCapacity) * 100) : 0;
                    progressEl.style.width = `${percent}%`;

                    progressEl.classList.remove('warning', 'danger');
                    if (percent > 90) progressEl.classList.add('danger');
                    else if (percent > 75) progressEl.classList.add('warning');
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
        const sortedTags = [...tagCounts.keys()].sort((a, b) => a.localeCompare(b));
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
