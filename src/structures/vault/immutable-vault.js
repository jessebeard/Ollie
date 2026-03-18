import { cryptoInstance } from '../../information-theory/cryptography/crypto-compat.js';
import { BatchEmbedder } from '../../information-theory/steganography/batch-embedder.js';
import { BatchExtractor } from '../../information-theory/steganography/batch-extractor.js';
import { SecureEntry } from './secure-record.js';
import { KeyDerivation } from '../../information-theory/cryptography/pbkdf2.js';

export class PasswordVault {
    constructor(entries = [], metadata = null, isUnlocked = false, masterPassword = null, sessionKey = null) {
        // We freeze the arrays and objects to ensure true immutability
        this.entries = Object.freeze([...entries].map(e => Object.freeze(e)));
        this.metadata = Object.freeze(metadata ? { ...metadata } : {
            version: '2.0',
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        });
        this.isUnlocked = isUnlocked;
        this.masterPassword = masterPassword;
        this.sessionKey = sessionKey;
        Object.freeze(this);
    }

    async _getSessionKey() {
        if (this.sessionKey) return [this.sessionKey, null];
        if (!this.masterPassword) return [null, new Error('Vault is locked')];
        const salt = new TextEncoder().encode('ollie-session-salt-1234');
        const [key, err] = await KeyDerivation.deriveKey(this.masterPassword, salt);
        return [key, err];
    }

    /**
     * @returns {Promise<[PasswordVault, Error|null]>} Tuple of [newVault, error]
     */
    async addEntry(entry, explicitId = null) {
        if (!entry || typeof entry !== 'object') return [this, new Error('Invalid entry data')];
        if (!this.isUnlocked) return [this, new Error('Vault is locked')];

        const [sessionKey, keyErr] = await this._getSessionKey();
        if (keyErr) return [this, keyErr];

        entry.id = explicitId || PasswordVault.generateId();

        const [secureEntry, secErr] = await SecureEntry.create(entry, sessionKey);
        if (secErr) return [this, secErr];

        const newMetadata = { ...this.metadata, modified: new Date().toISOString() };
        return [new PasswordVault([...this.entries, secureEntry], newMetadata, this.isUnlocked, this.masterPassword, sessionKey), null];
    }

    /**
     * @returns {Promise<[PasswordVault, Error|null]>} Tuple of [newVault, error]
     */
    async updateEntry(id, updates) {
        if (!this.isUnlocked) return [this, new Error('Vault is locked')];

        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) return [this, new Error('Entry not found')];

        const [sessionKey, keyErr] = await this._getSessionKey();
        if (keyErr) return [this, keyErr];

        const currentEntry = this.entries[index];
        // Decrypt current entry to merge updates
        const [decrypted, decErr] = await currentEntry.decrypt(sessionKey);
        if (decErr) return [this, decErr];

        const mergedEntry = {
            ...decrypted,
            ...updates,
            tags: updates.tags ? (Array.isArray(updates.tags) ? updates.tags : []) : decrypted.tags,
            customFields: updates.customFields ? (Array.isArray(updates.customFields) ? updates.customFields : []) : decrypted.customFields,
            modified: new Date().toISOString()
        };

        const [newSecureEntry, secErr] = await SecureEntry.create(mergedEntry, sessionKey);
        if (secErr) return [this, secErr];

        const newEntries = [...this.entries];
        newEntries[index] = newSecureEntry;
        const newMetadata = { ...this.metadata, modified: new Date().toISOString() };

        return [new PasswordVault(newEntries, newMetadata, this.isUnlocked, this.masterPassword, sessionKey), null];
    }

    /**
     * @returns {[PasswordVault, Error|null]} Tuple of [newVault, error]
     */
    deleteEntry(id) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) return [this, new Error('Entry not found')];

        const newEntries = [...this.entries];
        newEntries.splice(index, 1);
        const newMetadata = { ...this.metadata, modified: new Date().toISOString() };

        return [new PasswordVault(newEntries, newMetadata, this.isUnlocked, this.masterPassword, this.sessionKey), null];
    }

    search(query, tags = []) {
        const lowerQuery = (query || '').toLowerCase();

        return this.entries.filter(e => {
            const matchesText = !lowerQuery || (
                (e.title && e.title.toLowerCase().includes(lowerQuery)) ||
                (e.url && e.url.toLowerCase().includes(lowerQuery)) ||
                (e.username && e.username.toLowerCase().includes(lowerQuery))
            );

            const matchesTags = tags.length === 0 || tags.every(tag => e.tags.includes(tag));

            return matchesText && matchesTags;
        });
    }

    toJSON() {
        return {
            metadata: this.metadata,
            entries: this.entries.map(e => e.toJSON())
        };
    }

    /**
     * Produces a plaintext unencrypted JSON string for exporting.
     * Requires the vault to be unlocked.
     */
    async getPlaintextJSON() {
        if (!this.isUnlocked) return [null, new Error('Vault is locked')];
        const [sessionKey, keyErr] = await this._getSessionKey();
        if (keyErr) return [null, keyErr];

        const plaintextEntries = [];
        for (const entry of this.entries) {
            const [decrypted, decErr] = await entry.decrypt(sessionKey);
            if (decErr) return [null, decErr];
            plaintextEntries.push(decrypted);
        }

        const data = {
            metadata: this.metadata,
            entries: plaintextEntries
        };

        return [JSON.stringify(data, null, 2), null];
    }

    static fromJSON(data, isUnlocked = false, masterPassword = null, sessionKey = null) {
        if (data.metadata.version !== '2.0') {
            return [null, new Error('Unsupported vault version: ' + data.metadata.version)];
        }
        const secureEntries = data.entries.map(e => SecureEntry.fromJSON(e));
        return [new PasswordVault(secureEntries, data.metadata, isUnlocked, masterPassword, sessionKey), null];
    }

    async save(imageFiles, password, onProgress = null) {
        const vaultData = JSON.stringify(this.toJSON());
        const vaultBytes = new TextEncoder().encode(vaultData);

        const embedder = new BatchEmbedder();
        const options = {
            password: password,
            filename: 'vault.json',
            eccProfile: 'Extreme',
            ecc: true
        };

        const [results, embedErr] = await embedder.embed(vaultBytes, imageFiles, options, onProgress);
        if (embedErr) throw embedErr;
        return results;
    }

    static async load(imageFiles, password, onProgress = null) {
        const extractor = new BatchExtractor();
        const [result, extractErr] = await extractor.extract(imageFiles, password, onProgress);
        if (extractErr) {
            return [null, extractErr];
        }
        if (!result) {
            return [null, new Error('No vault data found in images')];
        }

        const vaultData = new TextDecoder().decode(result.data);
        let vaultJson;
        try {
            vaultJson = JSON.parse(vaultData);
        } catch (e) {
            return [null, new Error('Failed to parse vault data')];
        }

        const salt = new TextEncoder().encode('ollie-session-salt-1234');
        const [sessionKey, err] = await KeyDerivation.deriveKey(password, salt);
        if (err) return [null, err];

        return PasswordVault.fromJSON(vaultJson, true, password, sessionKey);
    }

    static generateId() {
        return cryptoInstance.randomUUID();
    }

    lock() {
        return new PasswordVault(this.entries, this.metadata, false, null, null);
    }
}
