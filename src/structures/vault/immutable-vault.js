import { BatchEmbedder } from '../../information-theory/steganography/batch-embedder.js';
import { BatchExtractor } from '../../information-theory/steganography/batch-extractor.js';
import { SecureEntry } from './secure-record.js';
import { KeyDerivation } from '../../information-theory/cryptography/pbkdf2.js';
import { Encryption } from '../../information-theory/cryptography/aes-gcm.js';
import { randomUUID, getCrypto } from '../../information-theory/cryptography/crypto-provider.js';

const KDF_ALGO = 'PBKDF2-SHA256';
const SESSION_KEY_BYTES = 32;

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return [bytes, null];
}

async function importSessionKey(rawBytes) {
    try {
        const [cryptoObj, cryptoErr] = getCrypto();
        if (cryptoErr) return [null, cryptoErr];
        const key = await cryptoObj.subtle.importKey(
            'raw',
            rawBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
        return [key, null];
    } catch (e) {
        return [null, e];
    }
}

export class PasswordVault {
    constructor(entries = [], metadata = null, isUnlocked = false, masterPassword = null, sessionKey = null) {
        // We freeze the arrays and objects to ensure true immutability
        this.entries = Object.freeze([...entries].map(e => Object.freeze(e)));
        this.metadata = Object.freeze(metadata ? { ...metadata } : {
            version: '3.0',
            revision: 0,
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        });
        this.isUnlocked = isUnlocked;

        // Credentials are held in a non-enumerable slot so they never leak
        // through serialization or key enumeration.
        const unlock = (isUnlocked && (masterPassword || sessionKey))
            ? Object.freeze({ password: masterPassword, sessionKey })
            : null;
        Object.defineProperty(this, '_unlock', {
            value: unlock,
            enumerable: false,
            writable: false,
            configurable: false
        });

        Object.freeze(this);
    }

    _password() {
        return this._unlock ? this._unlock.password : null;
    }

    _sessionKey() {
        return this._unlock ? this._unlock.sessionKey : null;
    }

    /**
     * Resolves the vault's random data-encryption session key.
     * When absent, it is either unwrapped from the stored KDF block
     * (existing vaults) or generated and wrapped fresh (new vaults).
     *
     * @returns {Promise<[CryptoKey|null, Object|null, Error|null]>} Tuple of [sessionKey, kdfBlock, error]
     */
    async _resolveSessionKey() {
        if (this._sessionKey()) return [this._sessionKey(), this.metadata.kdf || null, null];
        const masterPassword = this._password();
        if (!masterPassword) return [null, null, new Error('Vault is locked')];

        const existing = this.metadata.kdf;

        if (existing) {
            if (existing.algo !== KDF_ALGO || !Number.isInteger(existing.iterations)) {
                return [null, null, new Error('Vault KDF block has unsupported parameters')];
            }

            const [saltBytes] = base64ToBytes(existing.salt);
            const [ivBytes] = base64ToBytes(existing.wrapIV);
            const [wrappedBytes] = base64ToBytes(existing.wrappedSessionKey);

            const [kek, kekErr] = await KeyDerivation.deriveKey(
                masterPassword, saltBytes, { iterations: existing.iterations }
            );
            if (kekErr) return [null, null, kekErr];

            const [rawSessionKey, unwrapErr] = await Encryption.decrypt(wrappedBytes, kek, ivBytes);
            if (unwrapErr) {
                return [null, null, new Error('Vault unlock failed: invalid password or corrupted key material')];
            }

            const [sessionKey, importErr] = await importSessionKey(rawSessionKey);
            if (importErr) return [null, null, importErr];

            return [sessionKey, existing, null];
        }

        const [cryptoObj, cryptoErr] = getCrypto();
        if (cryptoErr) return [null, null, cryptoErr];

        const rawSessionKey = new Uint8Array(SESSION_KEY_BYTES);
        cryptoObj.getRandomValues(rawSessionKey);

        const [sessionKey, importErr] = await importSessionKey(rawSessionKey);
        if (importErr) return [null, null, importErr];

        const [salt, saltErr] = await KeyDerivation.generateSalt();
        if (saltErr) return [null, null, saltErr];

        const [kek, kekErr] = await KeyDerivation.deriveKey(masterPassword, salt);
        if (kekErr) return [null, null, kekErr];

        const [wrapResult, wrapErr] = await Encryption.encrypt(rawSessionKey, kek);
        if (wrapErr) return [null, null, wrapErr];

        const kdfBlock = {
            algo: KDF_ALGO,
            iterations: KeyDerivation.ITERATIONS,
            salt: bytesToBase64(salt),
            wrapIV: bytesToBase64(wrapResult.iv),
            wrappedSessionKey: bytesToBase64(new Uint8Array(wrapResult.ciphertext))
        };

        return [sessionKey, kdfBlock, null];
    }

    async _getSessionKey() {
        const [sessionKey, , err] = await this._resolveSessionKey();
        return [sessionKey, err];
    }

    /**
     * @returns {Promise<[PasswordVault, Error|null]>} Tuple of [newVault, error]
     */
    async addEntry(entry, explicitId = null) {
        if (!entry || typeof entry !== 'object') return [this, new Error('Invalid entry data')];
        if (!this.isUnlocked) return [this, new Error('Vault is locked')];

        const validationError = PasswordVault.validateEntryInput(entry);
        if (validationError) return [this, validationError];

        const [sessionKey, kdfBlock, keyErr] = await this._resolveSessionKey();
        if (keyErr) return [this, keyErr];

        const entryWithId = { ...entry, id: explicitId || PasswordVault.generateId() };

        const [secureEntry, secErr] = await SecureEntry.create(entryWithId, sessionKey);
        if (secErr) return [this, secErr];

        const newMetadata = {
            ...this.metadata,
            revision: this.metadata.revision + 1,
            ...(kdfBlock ? { kdf: kdfBlock } : {}),
            modified: new Date().toISOString()
        };
        return [new PasswordVault([...this.entries, secureEntry], newMetadata, this.isUnlocked, this._password(), sessionKey), null];
    }

    /**
     * @returns {Promise<[PasswordVault, Error|null]>} Tuple of [newVault, error]
     */
    async updateEntry(id, updates) {
        if (!this.isUnlocked) return [this, new Error('Vault is locked')];

        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) return [this, new Error('Entry not found')];

        for (const field of ['tags', 'customFields']) {
            if (updates[field] !== undefined && !Array.isArray(updates[field])) {
                return [this, new Error(`${field} must be an array`)];
            }
        }

        const [sessionKey, kdfBlock, keyErr] = await this._resolveSessionKey();
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
        const newMetadata = {
            ...this.metadata,
            revision: this.metadata.revision + 1,
            ...(kdfBlock ? { kdf: kdfBlock } : {}),
            modified: new Date().toISOString()
        };

        return [new PasswordVault(newEntries, newMetadata, this.isUnlocked, this._password(), sessionKey), null];
    }

    /**
     * @returns {[PasswordVault, Error|null]} Tuple of [newVault, error]
     */
    deleteEntry(id) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) return [this, new Error('Entry not found')];

        const newEntries = [...this.entries];
        newEntries.splice(index, 1);
        const newMetadata = { ...this.metadata, revision: this.metadata.revision + 1, modified: new Date().toISOString() };

        return [new PasswordVault(newEntries, newMetadata, this.isUnlocked, this._password(), this._sessionKey()), null];
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
        if (!data.metadata || data.metadata.version !== '3.0') {
            return [null, new Error('Unsupported vault version: ' + (data.metadata && data.metadata.version))];
        }
        if (!data.metadata.kdf) {
            return [null, new Error('Vault document is missing its KDF wrap block')];
        }
        if (!Number.isInteger(data.metadata.revision) || data.metadata.revision < 0) {
            return [null, new Error('Vault document is missing a valid revision counter')];
        }
        if (!Array.isArray(data.entries)) {
            return [null, new Error('Vault document entries must be an array')];
        }

        const secureEntries = [];
        for (let i = 0; i < data.entries.length; i++) {
            const [entry, entryErr] = SecureEntry.fromJSON(data.entries[i]);
            if (entryErr) {
                return [null, new Error(`Invalid vault entry at position ${i}: ${entryErr.message}`)];
            }
            secureEntries.push(entry);
        }
        return [new PasswordVault(secureEntries, data.metadata, isUnlocked, masterPassword, sessionKey), null];
    }

    /**
     * Embeds the serialized vault into the provided image files.
     * Guarantees a KDF wrap block exists in the serialized document.
     *
     * @returns {Promise<[Array<{name: string, data: Uint8Array}>|null, Error|null]>} Tuple of [results, error]
     */
    async save(imageFiles, password, onProgress = null) {
        const [, kdfBlock, keyErr] = await this._resolveSessionKey();
        if (keyErr) return [null, keyErr];

        const payloadMetadata = {
            ...this.metadata,
            ...(kdfBlock ? { kdf: kdfBlock } : {})
        };

        const vaultData = JSON.stringify({
            metadata: payloadMetadata,
            entries: this.entries.map(e => e.toJSON())
        });
        const vaultBytes = new TextEncoder().encode(vaultData);

        const embedder = new BatchEmbedder();
        const options = {
            password: password,
            filename: 'vault.json',
            eccProfile: 'Extreme',
            ecc: true
        };

        const [results, embedErr] = await embedder.embed(vaultBytes, imageFiles, options, onProgress);
        if (embedErr) return [null, embedErr];
        return [results, null];
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

        const kdf = vaultJson.metadata && vaultJson.metadata.kdf;
        const validKdf =
            kdf &&
            typeof kdf === 'object' &&
            kdf.algo === KDF_ALGO &&
            Number.isInteger(kdf.iterations) &&
            typeof kdf.salt === 'string' &&
            typeof kdf.wrapIV === 'string' &&
            typeof kdf.wrappedSessionKey === 'string';
        if (!validKdf) {
            return [null, new Error('Vault document is missing a valid KDF wrap block')];
        }

        const [saltBytes] = base64ToBytes(kdf.salt);
        const [ivBytes] = base64ToBytes(kdf.wrapIV);
        const [wrappedBytes] = base64ToBytes(kdf.wrappedSessionKey);

        const [kek, kekErr] = await KeyDerivation.deriveKey(password, saltBytes, { iterations: kdf.iterations });
        if (kekErr) return [null, kekErr];

        const [rawSessionKey, unwrapErr] = await Encryption.decrypt(wrappedBytes, kek, ivBytes);
        if (unwrapErr) {
            return [null, new Error('Vault unlock failed: invalid password or corrupted key material')];
        }

        const [sessionKey, importErr] = await importSessionKey(rawSessionKey);
        if (importErr) return [null, importErr];

        return PasswordVault.fromJSON(vaultJson, true, password, sessionKey);
    }

    /**
     * Validates untrusted entry input at the trust boundary.
     *
     * @param {Object} entry
     * @returns {Error|null} Typed error, or null when valid
     */
    static validateEntryInput(entry) {
        if (!entry || typeof entry !== 'object') {
            return new Error('Invalid entry data');
        }

        if (typeof entry.title !== 'string' || entry.title.length === 0) {
            return new Error('Entry "title" must be a non-empty string');
        }

        const stringFields = ['username', 'password', 'notes', 'totp', 'url'];
        for (const field of stringFields) {
            if (entry[field] !== undefined && typeof entry[field] !== 'string') {
                return new Error(`Entry "${field}" must be a string`);
            }
        }

        if (entry.tags !== undefined) {
            if (!Array.isArray(entry.tags)) {
                return new Error('Entry "tags" must be an array');
            }
            if (entry.tags.some(t => typeof t !== 'string')) {
                return new Error('Entry "tags" must contain only strings');
            }
        }

        if (entry.customFields !== undefined) {
            if (!Array.isArray(entry.customFields)) {
                return new Error('Entry "customFields" must be an array');
            }
            for (const cf of entry.customFields) {
                if (!cf || typeof cf !== 'object' ||
                    typeof cf.label !== 'string' || typeof cf.value !== 'string') {
                    return new Error('Entry "customFields" items need string "label" and "value"');
                }
            }
        }

        return null;
    }

    static generateId() {
        return randomUUID();
    }

    lock() {
        return new PasswordVault([], this.metadata, false, null, null);
    }
}
