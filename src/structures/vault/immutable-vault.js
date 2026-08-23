import { BatchEmbedder } from '../../information-theory/steganography/batch-embedder.js';
import { BatchExtractor } from '../../information-theory/steganography/batch-extractor.js';
import { SecureEntry } from './secure-record.js';
import { KeyDerivation } from '../../information-theory/cryptography/pbkdf2.js';
import { Encryption } from '../../information-theory/cryptography/aes-gcm.js';
import { randomUUID, getCrypto } from '../../information-theory/cryptography/crypto-provider.js';
import { utf8ToBytes } from '../../utils/encoding.js';

const EXPORT_FORMAT = 'ollie-export';
const EXPORT_VERSION = 1;

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
    /**
     * Hidden credential slot; installed non-enumerably in the constructor.
     * @type {{password: string|null, sessionKey: CryptoKey|null}|null}
     */
    _unlock = null;

    /**
     * @param {readonly Object[]} [entries]
     * @param {Object|null} [metadata]
     * @param {boolean} [isUnlocked]
     * @param {string|null} [masterPassword]
     * @param {CryptoKey|null} [sessionKey]
     */
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

        if (explicitId !== null && explicitId !== undefined) {
            const idError = PasswordVault.validateEntryId(explicitId, this.entries);
            if (idError) return [this, idError];
        }

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
        if (!this.isUnlocked) return [];

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

        /**
     * Rehydrates a vault from its serialized document.
     * @param {Object} data - Serialized vault document
     * @returns {[PasswordVault|null, Error|null]} Result tuple of [vault, error]
     */
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
    async save(imageFiles, password, onProgress = null, options = {}) {
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
        const embedOptions = {
            password: password,
            filename: 'vault.json',
            eccProfile: 'Extreme',
            ecc: true,
            manifest: { revision: this.metadata.revision }
        };
        if (options.threshold !== undefined) {
            embedOptions.threshold = options.threshold;
        }

        const [results, embedErr] = await embedder.embed(vaultBytes, imageFiles, embedOptions, onProgress);
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

        const manifest = result.metadata && result.metadata.manifest;
        if (!manifest) {
            return [null, new Error('Carrier set has no tamper-protection manifest - re-save required')];
        }

        const vaultData = new TextDecoder().decode(result.data);
        let vaultJson;
        try {
            vaultJson = JSON.parse(vaultData);
        } catch (e) {
            return [null, new Error('Failed to parse vault data')];
        }

        // Document binding: the authenticated manifest must describe exactly
        // this revision, else the carrier set was rolled back or mixed.
        if (Number.isInteger(vaultJson.metadata && vaultJson.metadata.revision) &&
            vaultJson.metadata.revision !== manifest.revision) {
            return [null, new Error(
                `Vault revision ${vaultJson.metadata.revision} does not match authenticated carrier manifest (revision ${manifest.revision})`
            )];
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
     * Validates an externally supplied entry identifier at the trust boundary.
     * Imported entries carry attacker-readable IDs: they must be bounded
     * strings and must not collide with entries already in the vault.
     *
     * @param {string} id
     * @param {readonly {id: string}[]} [existingEntries]
     * @returns {Error|null} Typed error, or null when valid
     */
    static validateEntryId(id, existingEntries = []) {
        if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
            return new Error('Entry "id" must be a non-empty string of at most 128 characters');
        }
        if (existingEntries.some(e => e && e.id === id)) {
            return new Error(`Duplicate entry ID: ${id}`);
        }
        return null;
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

    /**
     * Serializes the vault into a password-encrypted, self-contained JSON
     * envelope. The envelope password doubles as the inner wrap password,
     * so a single secret opens the whole artifact.
     *
     * @param {string} [password] - Defaults to the vault's own credential
     * @returns {Promise<[string|null, Error|null]>} Tuple of [envelopeJson, error]
     */
    async exportEncrypted(password = null) {
        const masterPassword = password || this._password();
        if (!masterPassword) return [null, new Error('Vault is locked')];

        const [, kdfBlock, keyErr] = await this._resolveSessionKey();
        if (keyErr) return [null, keyErr];

        const doc = {
            metadata: { ...this.metadata, ...(kdfBlock ? { kdf: kdfBlock } : {}) },
            entries: this.entries.map(e => e.toJSON())
        };
        const docBytes = utf8ToBytes(JSON.stringify(doc));

        const [salt, saltErr] = await KeyDerivation.generateSalt();
        if (saltErr) return [null, saltErr];

        const [key, deriveErr] = await KeyDerivation.deriveKey(masterPassword, salt);
        if (deriveErr) return [null, deriveErr];

        const bindingData = utf8ToBytes(`${EXPORT_FORMAT}/v${EXPORT_VERSION}`);
        const [enc, encErr] = await Encryption.encrypt(docBytes, key, { additionalData: bindingData });
        if (encErr) return [null, encErr];

        const envelope = {
            format: EXPORT_FORMAT,
            version: EXPORT_VERSION,
            kdf: {
                algo: KDF_ALGO,
                iterations: KeyDerivation.ITERATIONS,
                salt: bytesToBase64(salt),
                iv: bytesToBase64(enc.iv),
                ciphertext: bytesToBase64(new Uint8Array(enc.ciphertext))
            }
        };
        return [JSON.stringify(envelope), null];
    }

    /**
     * Rehydrates a vault from an encrypted export envelope.
     *
     * @param {string} envelopeJson
     * @param {string} password
     * @returns {Promise<[PasswordVault|null, Error|null]>}
     */
    static async importEncrypted(envelopeJson, password) {
        if (typeof envelopeJson !== 'string') {
            return [null, new Error('Invalid export envelope: expected a JSON string')];
        }

        let envelope;
        try {
            envelope = JSON.parse(envelopeJson);
        } catch (e) {
            return [null, new Error('Invalid export envelope: not valid JSON')];
        }

        if (!envelope || envelope.format !== EXPORT_FORMAT || envelope.version !== EXPORT_VERSION) {
            return [null, new Error(`Invalid export envelope: expected ${EXPORT_FORMAT} v${EXPORT_VERSION}`)];
        }

        const k = envelope.kdf;
        if (!k || typeof k !== 'object' || k.algo !== KDF_ALGO || !Number.isInteger(k.iterations) ||
            typeof k.salt !== 'string' || typeof k.iv !== 'string' || typeof k.ciphertext !== 'string') {
            return [null, new Error('Invalid export envelope: malformed KDF block')];
        }

        const [saltBytes] = base64ToBytes(k.salt);
        const [ivBytes] = base64ToBytes(k.iv);
        const [cipherBytes] = base64ToBytes(k.ciphertext);

        const [key, deriveErr] = await KeyDerivation.deriveKey(password, saltBytes, { iterations: k.iterations });
        if (deriveErr) return [null, deriveErr];

        const bindingData = utf8ToBytes(`${EXPORT_FORMAT}/v${EXPORT_VERSION}`);
        const [docBytes, decErr] = await Encryption.decrypt(cipherBytes, key, ivBytes, { additionalData: bindingData });
        if (decErr) {
            return [null, new Error('Import failed: wrong password or corrupted envelope')];
        }

        let doc;
        try {
            doc = JSON.parse(new TextDecoder().decode(docBytes));
        } catch (e) {
            return [null, new Error('Invalid export payload: not valid JSON')];
        }

        const [vault, vaultErr] = PasswordVault.fromJSON(doc, true, password, null);
        if (vaultErr) return [null, vaultErr];

        const [sessionKey, , skErr] = await vault._resolveSessionKey();
        if (skErr) return [null, skErr];

        return [new PasswordVault(vault.entries, vault.metadata, true, password, sessionKey), null];
    }

    static generateId() {
        return randomUUID();
    }

    lock() {
        return new PasswordVault([], this.metadata, false, null, null);
    }
}
