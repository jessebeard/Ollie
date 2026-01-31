
import { BatchEmbedder } from '../steganography/batch-embedder.js';
import { BatchExtractor } from '../steganography/batch-extractor.js';

export class PasswordVault {
    constructor() {
        this.entries = [];
        this.metadata = {
            version: '2.0',
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
        this.isUnlocked = false;
        this.masterPassword = null;
    }

    addEntry(entry) {
        const newEntry = {
            id: this.generateId(),
            title: entry.title || '',
            url: entry.url || '',
            username: entry.username || '',
            password: entry.password || '',
            notes: entry.notes || '',
            tags: Array.isArray(entry.tags) ? entry.tags : [],
            totp: entry.totp || '',
            customFields: Array.isArray(entry.customFields) ? entry.customFields : [],
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
        this.entries.push(newEntry);
        this.metadata.modified = new Date().toISOString();
        return newEntry;
    }

    updateEntry(id, updates) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) throw new Error('Entry not found');

        const current = this.entries[index];
        this.entries[index] = {
            ...current,
            ...updates,
            tags: updates.tags ? (Array.isArray(updates.tags) ? updates.tags : []) : current.tags,
            customFields: updates.customFields ? (Array.isArray(updates.customFields) ? updates.customFields : []) : current.customFields,
            modified: new Date().toISOString()
        };
        this.metadata.modified = new Date().toISOString();
        return this.entries[index];
    }

    deleteEntry(id) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) throw new Error('Entry not found');

        this.entries.splice(index, 1);
        this.metadata.modified = new Date().toISOString();
    }

    search(query, tags = []) {
        const lowerQuery = query.toLowerCase();

        return this.entries.filter(e => {
            const matchesText = !query || (
                e.title?.toLowerCase().includes(lowerQuery) ||
                e.url?.toLowerCase().includes(lowerQuery) ||
                e.username?.toLowerCase().includes(lowerQuery) ||
                e.notes?.toLowerCase().includes(lowerQuery)
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

    fromJSON(data) {
        if (data.metadata.version !== '2.0') {
            throw new Error('Unsupported vault version: ' + data.metadata.version);
        }

        this.metadata = data.metadata;
        this.entries = data.entries;
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

        return await embedder.embed(vaultBytes, imageFiles, options, onProgress);
    }

    async load(imageFiles, password, onProgress = null) {
        const extractor = new BatchExtractor();
        const result = await extractor.extract(imageFiles, password, onProgress);

        const vaultData = new TextDecoder().decode(result.data);
        const vault = JSON.parse(vaultData);

        this.fromJSON(vault);
        this.isUnlocked = true;
        this.masterPassword = password;

        return this;
    }

    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    lock() {
        this.isUnlocked = false;
        this.masterPassword = null;
    }
}
