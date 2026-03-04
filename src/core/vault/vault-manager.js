
import { BatchEmbedder } from '../steganography/batch-embedder.js';
import { BatchExtractor } from '../steganography/batch-extractor.js';

export class PasswordVault {
    constructor(entries = [], metadata = null, isUnlocked = false, masterPassword = null) {
        // We freeze the arrays and objects to ensure true immutability
        this.entries = Object.freeze([...entries].map(e => Object.freeze({ ...e })));
        this.metadata = Object.freeze(metadata ? { ...metadata } : {
            version: '2.0',
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        });
        this.isUnlocked = isUnlocked;
        this.masterPassword = masterPassword;
        Object.freeze(this);
    }

    /**
     * @returns {[PasswordVault, Error|null]} Tuple of [newVault, error]
     */
    addEntry(entry, explicitId = null) {
        if (!entry || typeof entry !== 'object') return [this, new Error('Invalid entry data')];
        const newEntry = {
            id: explicitId || PasswordVault.generateId(),
            title: typeof entry.title === 'string' ? entry.title : '',
            url: typeof entry.url === 'string' ? entry.url : '',
            username: typeof entry.username === 'string' ? entry.username : '',
            password: typeof entry.password === 'string' ? entry.password : '',
            notes: typeof entry.notes === 'string' ? entry.notes : '',
            tags: Array.isArray(entry.tags) ? entry.tags : [],
            totp: entry.totp || '',
            customFields: Array.isArray(entry.customFields) ? entry.customFields : [],
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
        const newMetadata = { ...this.metadata, modified: new Date().toISOString() };
        return [new PasswordVault([...this.entries, newEntry], newMetadata, this.isUnlocked, this.masterPassword), null];
    }

    /**
     * @returns {[PasswordVault, Error|null]} Tuple of [newVault, error]
     */
    updateEntry(id, updates) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) return [this, new Error('Entry not found')];

        const current = this.entries[index];
        const updatedEntry = {
            ...current,
            ...updates,
            tags: updates.tags ? (Array.isArray(updates.tags) ? updates.tags : []) : current.tags,
            customFields: updates.customFields ? (Array.isArray(updates.customFields) ? updates.customFields : []) : current.customFields,
            modified: new Date().toISOString()
        };

        const newEntries = [...this.entries];
        newEntries[index] = updatedEntry;
        const newMetadata = { ...this.metadata, modified: new Date().toISOString() };

        return [new PasswordVault(newEntries, newMetadata, this.isUnlocked, this.masterPassword), null];
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

        return [new PasswordVault(newEntries, newMetadata, this.isUnlocked, this.masterPassword), null];
    }

    search(query, tags = []) {
        const lowerQuery = (query || '').toLowerCase();

        return this.entries.filter(e => {
            const matchesText = !lowerQuery || (
                (e.title && e.title.toLowerCase().includes(lowerQuery)) ||
                (e.url && e.url.toLowerCase().includes(lowerQuery)) ||
                (e.username && e.username.toLowerCase().includes(lowerQuery)) ||
                (e.notes && e.notes.toLowerCase().includes(lowerQuery))
            );

            const matchesTags = tags.length === 0 || tags.every(tag => e.tags.includes(tag));

            return matchesText && matchesTags;
        });
    }

    toJSON() {
        return {
            metadata: this.metadata,
            entries: this.entries
        };
    }

    static fromJSON(data, isUnlocked = false, masterPassword = null) {
        if (data.metadata.version !== '2.0') {
            return [null, new Error('Unsupported vault version: ' + data.metadata.version)];
        }
        return [new PasswordVault(data.entries, data.metadata, isUnlocked, masterPassword), null];
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

        return PasswordVault.fromJSON(vaultJson, true, password);
    }

    static generateId() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    lock() {
        return new PasswordVault(this.entries, this.metadata, false, null);
    }
}
