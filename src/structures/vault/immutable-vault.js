import { BatchEmbedder } from '../../information-theory/steganography/batch-embedder.js';
import { BatchExtractor } from '../../information-theory/steganography/batch-extractor.js';
import { SecureEntry } from './secure-record.js';
import { KeyDerivation } from '../../information-theory/cryptography/pbkdf2.js';
import { Encryption } from '../../information-theory/cryptography/aes-gcm.js';
import { normalizeTotpInput, buildOtpauthUri, codeFromOtpauthUri } from '../../information-theory/cryptography/totp.js';
import { encodeBase32, decodeBase32 } from '../../utils/base32.js';
import { randomUUID, getCrypto } from '../../information-theory/cryptography/crypto-provider.js';
import { utf8ToBytes, bytesToBase64, base64ToBytes } from '../../utils/encoding.js';

export const EXPORT_FORMAT = 'ollie-export';
export const EXPORT_VERSION = 2;
export const EXPORT_TUPLE_LENGTH = 4;

export const KDF_ALGO = 'PBKDF2-SHA256';
const SESSION_KEY_BYTES = 32;

/**
 * Packs export envelope fields into a compact positional tuple per Rule 16:
 * [format, version, [algo, iterations, salt, iv], ciphertext]
 *
 * @param {Object} spec
 * @returns {[Array|null, Error|null]}
 */
export function packExportEnvelope(spec) {
    if (!spec || typeof spec !== 'object') {
        return [null, new Error('export-envelope: spec object required')];
    }
    const format = spec.format || EXPORT_FORMAT;
    const version = Number.isInteger(spec.version) ? spec.version : EXPORT_VERSION;
    const k = spec.kdf;
    if (!k || typeof k !== 'object') {
        return [null, new Error('export-envelope: kdf spec required')];
    }
    const algo = k.algo || KDF_ALGO;
    const iterations = k.iterations || KeyDerivation.ITERATIONS;
    if (!Number.isInteger(iterations) || iterations < 1) {
        return [null, new Error('export-envelope: iterations must be an integer >= 1')];
    }
    if (typeof k.salt !== 'string' || typeof k.iv !== 'string') {
        return [null, new Error('export-envelope: salt and iv must be base64 strings')];
    }
    const ciphertext = spec.ciphertext || k.ciphertext;
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
        return [null, new Error('export-envelope: ciphertext must be a non-empty base64 string')];
    }

    const kdfTuple = [algo, iterations, k.salt, k.iv];
    return [[format, version, kdfTuple, ciphertext], null];
}

/**
 * Unpacks and strictly validates an export envelope per Rule 16.
 * Accepts canonical positional tuples and legacy dictionary objects.
 *
 * @param {string|Array|Object} input
 * @returns {[{format: string, version: number, kdf: {algo: string, iterations: number, salt: string, iv: string, ciphertext: string}, ciphertext: string}|null, Error|null]}
 */
export function unpackExportEnvelope(input) {
    if (!input) {
        return [null, new Error('Invalid export envelope: empty input')];
    }
    let parsed = input;
    if (typeof input === 'string') {
        try {
            parsed = JSON.parse(input);
        } catch (e) {
            return [null, new Error('Invalid export envelope: not valid JSON')];
        }
    }

    if (Array.isArray(parsed)) {
        if (parsed.length !== EXPORT_TUPLE_LENGTH) {
            return [null, new Error(`Invalid export envelope: tuple length ${parsed.length}, expected ${EXPORT_TUPLE_LENGTH}`)];
        }
        const [format, version, kdfRaw, ciphertext] = parsed;
        if (format !== EXPORT_FORMAT) {
            return [null, new Error(`Invalid export envelope: expected ${EXPORT_FORMAT}, got ${format}`)];
        }
        if (version !== 1 && version !== 2) {
            return [null, new Error(`Invalid export envelope: unsupported version ${version}`)];
        }
        if (!Array.isArray(kdfRaw) || kdfRaw.length !== 4) {
            return [null, new Error('Invalid export envelope: malformed KDF tuple')];
        }
        const [algo, iterations, salt, iv] = kdfRaw;
        if (algo !== KDF_ALGO || !Number.isInteger(iterations) || typeof salt !== 'string' || typeof iv !== 'string') {
            return [null, new Error('Invalid export envelope: malformed KDF block')];
        }
        if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
            return [null, new Error('Invalid export envelope: missing ciphertext')];
        }
        return [{
            format,
            version,
            kdf: { algo, iterations, salt, iv, ciphertext },
            ciphertext
        }, null];
    }

    if (parsed && typeof parsed === 'object') {
        if (parsed.format !== EXPORT_FORMAT) {
            return [null, new Error(`Invalid export envelope: expected ${EXPORT_FORMAT}`)];
        }
        if (parsed.version !== 1 && parsed.version !== 2) {
            return [null, new Error(`Invalid export envelope: unsupported version ${parsed.version}`)];
        }
        const k = parsed.kdf;
        if (!k || typeof k !== 'object' || k.algo !== KDF_ALGO || !Number.isInteger(k.iterations) ||
            typeof k.salt !== 'string' || typeof k.iv !== 'string') {
            return [null, new Error('Invalid export envelope: malformed KDF block')];
        }
        const ciphertext = typeof k.ciphertext === 'string' ? k.ciphertext : parsed.ciphertext;
        if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
            return [null, new Error('Invalid export envelope: missing ciphertext')];
        }
        return [{
            format: parsed.format,
            version: parsed.version,
            kdf: { algo: k.algo, iterations: k.iterations, salt: k.salt, iv: k.iv, ciphertext },
            ciphertext
        }, null];
    }

    return [null, new Error('Invalid export envelope: expected array tuple or object')];
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
    #password = null;
    #sessionKey = null;

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

        // Credentials are held in private class fields so they are syntactically
        // inaccessible from outside the class instance (defense against DOM/extension inspection).
        this.#password = isUnlocked ? masterPassword : null;
        this.#sessionKey = isUnlocked ? sessionKey : null;

        Object.freeze(this);
    }

    _password() {
        return this.#password;
    }

    _sessionKey() {
        return this.#sessionKey;
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

            const [saltBytes, sErr] = base64ToBytes(existing.salt);
            const [ivBytes, iErr] = base64ToBytes(existing.wrapIV);
            const [wrappedBytes, wErr] = base64ToBytes(existing.wrappedSessionKey);
            if (sErr || iErr || wErr || !saltBytes || !ivBytes || !wrappedBytes) {
                return [null, null, new Error('Vault unlock failed: corrupted KDF key material')];
            }

            const [kek, kekErr] = await KeyDerivation.deriveKey(
                masterPassword, saltBytes, { iterations: existing.iterations, allowLegacy: true }
            );
            if (kekErr) return [null, null, kekErr];

            const [rawSessionKey, unwrapErr] = await Encryption.decrypt(wrappedBytes, kek, ivBytes);
            if (unwrapErr) {
                return [null, null, new Error('Vault unlock failed: invalid password or corrupted key material')];
            }

            const [sessionKey, importErr] = await importSessionKey(rawSessionKey);
            rawSessionKey.fill(0);
            if (importErr) return [null, null, importErr];

            return [sessionKey, existing, null];
        }

        const [cryptoObj, cryptoErr] = getCrypto();
        if (cryptoErr) return [null, null, cryptoErr];

        const rawSessionKey = new Uint8Array(SESSION_KEY_BYTES);
        cryptoObj.getRandomValues(rawSessionKey);

        const [sessionKey, importErr] = await importSessionKey(rawSessionKey);
        if (importErr) {
            rawSessionKey.fill(0);
            return [null, null, importErr];
        }

        const [salt, saltErr] = await KeyDerivation.generateSalt();
        if (saltErr) {
            rawSessionKey.fill(0);
            return [null, null, saltErr];
        }

        const [kek, kekErr] = await KeyDerivation.deriveKey(masterPassword, salt);
        if (kekErr) {
            rawSessionKey.fill(0);
            return [null, null, kekErr];
        }

        const [wrapResult, wrapErr] = await Encryption.encrypt(rawSessionKey, kek);
        rawSessionKey.fill(0);
        if (wrapErr) return [null, null, wrapErr];

        const kdfBlock = {
            algo: KDF_ALGO,
            iterations: KeyDerivation.ITERATIONS,
            salt: bytesToBase64(salt),
            wrapIV: bytesToBase64(wrapResult.iv),
            wrappedSessionKey: bytesToBase64(new Uint8Array(wrapResult.ciphertext)),
            lastRotated: new Date().toISOString()
        };

        return [sessionKey, kdfBlock, null];
    }

    async _getSessionKey() {
        const [sessionKey, , err] = await this._resolveSessionKey();
        return [sessionKey, err];
    }

    /**
     * Changes the master password by rotating the KDF salt and re-wrapping
     * the existing data encryption session key under the new credential.
     *
     * @param {string} newMasterPassword - New non-empty master password string
     * @param {Object} [options]
     * @param {number} [options.iterations] - Custom PBKDF2 iterations (floor: 600,000)
     * @returns {Promise<[PasswordVault|null, Error|null]>}
     */
    async changeMasterPassword(newMasterPassword, options = {}) {
        if (!this.isUnlocked) return [null, new Error('Vault is locked')];
        if (!newMasterPassword || typeof newMasterPassword !== 'string' || newMasterPassword.trim().length === 0) {
            return [null, new Error('New master password must be a non-empty string')];
        }

        const iterations = options.iterations !== undefined
            ? options.iterations
            : (this.metadata.kdf?.iterations || KeyDerivation.ITERATIONS);
        const validIterations = KeyDerivation.resolveIterations(iterations);
        if (validIterations instanceof Error) {
            return [null, validIterations];
        }

        const [sessionKey, , keyErr] = await this._resolveSessionKey();
        if (keyErr || !sessionKey) return [null, keyErr || new Error('Session key unavailable')];

        const existing = this.metadata.kdf;
        let rawSessionKey;
        if (existing) {
            const [saltBytes, sErr] = base64ToBytes(existing.salt);
            const [ivBytes, iErr] = base64ToBytes(existing.wrapIV);
            const [wrappedBytes, wErr] = base64ToBytes(existing.wrappedSessionKey);
            if (sErr || iErr || wErr || !saltBytes || !ivBytes || !wrappedBytes) {
                return [null, new Error('Corrupted existing KDF block')];
            }

            const [kek, kekErr] = await KeyDerivation.deriveKey(this._password(), saltBytes, { iterations: existing.iterations, allowLegacy: true });
            if (kekErr) return [null, kekErr];
            const [raw, unwrapErr] = await Encryption.decrypt(wrappedBytes, kek, ivBytes);
            if (unwrapErr) return [null, unwrapErr];
            rawSessionKey = raw;
        } else {
            const [cryptoObj, cryptoErr] = getCrypto();
            if (cryptoErr) return [null, cryptoErr];
            rawSessionKey = new Uint8Array(SESSION_KEY_BYTES);
            cryptoObj.getRandomValues(rawSessionKey);
        }

        const [newSalt, saltErr] = await KeyDerivation.generateSalt();
        if (saltErr) {
            rawSessionKey.fill(0);
            return [null, saltErr];
        }
        const [newKek, kekErr] = await KeyDerivation.deriveKey(newMasterPassword, newSalt, { iterations: validIterations });
        if (kekErr) {
            rawSessionKey.fill(0);
            return [null, kekErr];
        }

        const [wrapResult, wrapErr] = await Encryption.encrypt(rawSessionKey, newKek);
        rawSessionKey.fill(0);
        if (wrapErr) return [null, wrapErr];

        const newKdfBlock = {
            algo: KDF_ALGO,
            iterations: validIterations,
            salt: bytesToBase64(newSalt),
            wrapIV: bytesToBase64(wrapResult.iv),
            wrappedSessionKey: bytesToBase64(new Uint8Array(wrapResult.ciphertext)),
            lastRotated: new Date().toISOString()
        };

        const newMetadata = {
            ...this.metadata,
            kdf: newKdfBlock,
            revision: this.metadata.revision + 1,
            modified: new Date().toISOString()
        };

        return [new PasswordVault(this.entries, newMetadata, true, newMasterPassword, sessionKey), null];
    }

    /**
     * Calculates the elapsed age of the current master password in days.
     * @returns {number} Age in full days
     */
    getPasswordAgeDays() {
        const timestamp = this.metadata?.kdf?.lastRotated || this.metadata?.created;
        if (!timestamp) return 0;
        const diffMs = Date.now() - new Date(timestamp).getTime();
        return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    /**
     * @returns {Promise<[PasswordVault, Error|null]>} Tuple of [newVault, error]
     */
    async addEntry(entry, explicitId = null) {
        if (!entry || typeof entry !== 'object') return [this, new Error('Invalid entry data')];
        if (!this.isUnlocked) return [this, new Error('Vault is locked')];

        const [prepared, prepErr] = PasswordVault.prepareEntryInput(entry);
        if (prepErr) return [this, prepErr];

        const validationError = PasswordVault.validateEntryInput(prepared);
        if (validationError) return [this, validationError];

        if (explicitId !== null && explicitId !== undefined) {
            const idError = PasswordVault.validateEntryId(explicitId, this.entries);
            if (idError) return [this, idError];
        }

        const [sessionKey, kdfBlock, keyErr] = await this._resolveSessionKey();
        if (keyErr) return [this, keyErr];

        const entryWithId = { ...prepared, id: explicitId || PasswordVault.generateId() };

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
        const [decrypted, decErr] = await currentEntry.decrypt(sessionKey);
        if (decErr) return [this, decErr];

        const mergedEntry = {
            ...decrypted,
            ...updates,
            tags: updates.tags ? (Array.isArray(updates.tags) ? updates.tags : []) : decrypted.tags,
            customFields: updates.customFields ? (Array.isArray(updates.customFields) ? updates.customFields : []) : decrypted.customFields,
            modified: new Date().toISOString()
        };

        const [preparedMerge, prepErr] = PasswordVault.prepareEntryInput(mergedEntry);
        if (prepErr) return [this, prepErr];

        const validationError = PasswordVault.validateEntryInput(preparedMerge);
        if (validationError) return [this, validationError];

        const [newSecureEntry, secErr] = await SecureEntry.create(preparedMerge, sessionKey);
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
     * When supplied with a string password as the second argument, it asynchronously
     * verifies the KDF block, derives the KEK, and unwraps the session key to unlock the vault.
     *
     * @param {Object} data - Serialized vault document
     * @param {boolean|string} [isUnlocked=false] - Whether unlocked, or password string
     * @param {string|null} [masterPassword=null]
     * @param {CryptoKey|null} [sessionKey=null]
     * @returns {Promise<[PasswordVault|null, Error|null]>|[PasswordVault|null, Error|null]}
     */
    static fromJSON(data, isUnlocked = false, masterPassword = null, sessionKey = null) {
        if (!data || typeof data !== 'object') {
            return [null, new Error('Invalid vault document: expected an object')];
        }
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

        if (typeof isUnlocked === 'string') {
            const password = isUnlocked;
            return (async () => {
                const k = data.metadata.kdf;
                if (!k || typeof k !== 'object' || k.algo !== KDF_ALGO || !Number.isInteger(k.iterations) ||
                    typeof k.salt !== 'string' || typeof k.wrapIV !== 'string' || typeof k.wrappedSessionKey !== 'string') {
                    return [null, new Error('Vault unlock failed: malformed KDF block')];
                }

                const [saltBytes, sErr] = base64ToBytes(k.salt);
                const [ivBytes, iErr] = base64ToBytes(k.wrapIV);
                const [wrappedBytes, wErr] = base64ToBytes(k.wrappedSessionKey);
                if (sErr || iErr || wErr || !saltBytes || !ivBytes || !wrappedBytes) {
                    return [null, new Error('Vault unlock failed: corrupted KDF key material')];
                }

                const [kek, kekErr] = await KeyDerivation.deriveKey(password, saltBytes, { iterations: k.iterations, allowLegacy: true });
                if (kekErr) return [null, kekErr];

                const [rawSessionKey, unwrapErr] = await Encryption.decrypt(wrappedBytes, kek, ivBytes);
                if (unwrapErr) {
                    return [null, new Error('Vault unlock failed: invalid password or corrupted key material')];
                }

                const [sessionKeyObj, importErr] = await importSessionKey(rawSessionKey);
                if (importErr) return [null, importErr];

                return [new PasswordVault(secureEntries, data.metadata, true, password, sessionKeyObj), null];
            })();
        }

        return [new PasswordVault(secureEntries, data.metadata, isUnlocked, masterPassword, sessionKey), null];
    }

    /**
     * Embeds the serialized vault into the provided image files.
     * Guarantees a KDF wrap block exists in the serialized document.
     *
     * @returns {Promise<[Array<{name: string, data: Uint8Array, sourceIndex: number}>|null, Error|null]>} Tuple of [results, error]
     */
    async save(imageFiles, password, onProgress = null, options = {}) {
        if (typeof onProgress === 'object' && onProgress !== null) {
            options = onProgress;
            onProgress = null;
        }
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
        if (options && options.threshold !== undefined) {
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

        const [kek, kekErr] = await KeyDerivation.deriveKey(password, saltBytes, { iterations: kdf.iterations, allowLegacy: true });
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
     * Tier B access control: enables a TOTP code gate on this vault.
     * WEAK ACCESS CONTROL ONLY - the secret lives inside the encrypted
     * vault document, so anyone with the master password can defeat it.
     * It deters shoulder-surfing and opportunistic access, nothing more.
     *
     * @returns {Promise<[Object|null, Error|null]>} Tuple of [{vault, uri}, error]
     */
    async enableTotpGate() {
        if (!this.isUnlocked) return [null, new Error('Vault is locked')];
        if (this.metadata.totpGate) return [null, new Error('TOTP gate already enabled')];

        const [cryptoObj] = getCrypto();
        const secretBytes = new Uint8Array(20);
        cryptoObj.getRandomValues(secretBytes);
        const secret = encodeBase32(secretBytes);

        const [uri, uriErr] = buildOtpauthUri({ label: 'Ollie Vault', secret });
        if (uriErr) return [null, uriErr];

        const metadata = { ...this.metadata, totpGate: { secret, enrolled: new Date().toISOString() } };
        const nv = new PasswordVault(this.entries, metadata, this.isUnlocked, this._password(), this._sessionKey());
        return [{ vault: nv, uri }, null];
    }

    /**
     * Verifies a candidate gate code against the enrolled secret with a
     * single-step drift window by default.
     *
     * @param {string} code Candidate 6+ digit code
     * @param {{now?: number, window?: number}} [options]
     * @returns {Promise<[{valid: boolean}|null, Error|null]>}
     */
    async verifyTotpGate(code, options = {}) {
        if (!this.isUnlocked) return [{ valid: false }, new Error('Vault is locked')];
        const gate = this.metadata && this.metadata.totpGate;
        if (!gate) return [{ valid: false }, null];
        if (typeof code !== 'string' || !/^[0-9]{6,10}$/.test(code.trim())) {
            return [{ valid: false }, null];
        }
        const [secretBytes, decErr] = decodeBase32(gate.secret);
        if (decErr) return [{ valid: false }, new Error('Gate secret is corrupt: ' + decErr.message)];
        
        const period = 30;
        const nowSec = options.now !== undefined ? options.now : Math.floor(Date.now() / 1000);
        const window = options.window !== undefined ? options.window : 1;
        const trimmed = typeof code === 'string' ? code.trim() : '';
        let valid = false;
        for (let off = -window; off <= window && !valid; off++) {
            const at = nowSec + off * period;
            const [candidate, candErr] = await codeFromOtpauthUri(
                'otpauth://totp/gate?secret=' + gate.secret, { now: at });
            if (candErr || !candidate) continue;
            if (candidate === trimmed) valid = true;
        }
        void secretBytes;
        return [{ valid }, null];
    }

    /**
     * Removes the TOTP gate.
     * @returns {Promise<[PasswordVault|null, Error|null]>}
     */
    async disableTotpGate() {
        if (!this.isUnlocked) return [null, new Error('Vault is locked')];
        if (!this.metadata || !this.metadata.totpGate) return [this, null];
        const metadata = { ...this.metadata };
        delete metadata.totpGate;
        const nv = new PasswordVault(this.entries, metadata, this.isUnlocked, this._password(), this._sessionKey());
        return [nv, null];
    }

    /**
     * Normalizes mutable user input before validation/storage: blank TOTP
     * values are dropped and bare Base32 secrets are wrapped into
     * canonical otpauth:// URIs so stored entries are always uniform.
     *
     * @param {Object} entry Raw input object (copied, never mutated)
     * @returns {[Object|null, Error|null]} Tuple of [preparedEntry, error]
     */
    static prepareEntryInput(entry) {
        const prepared = { ...entry };
        if (prepared.totp === '' || prepared.totp === null) {
            delete prepared.totp;
        } else if (prepared.totp !== undefined) {
            const [normTotp, normErr] = normalizeTotpInput(prepared.totp, prepared.title);
            if (normErr) {
                return [null, new Error(`Entry "totp" is invalid: ${normErr.message}`)];
            }
            prepared.totp = normTotp;
        }
        return [prepared, null];
    }

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

        if (entry.totp !== undefined && entry.totp !== '') {
            const [, totpErr] = normalizeTotpInput(entry.totp, entry.title);
            if (totpErr) {
                return new Error(`Entry "totp" is invalid: ${totpErr.message}`);
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
    /**
     * Serializes the vault into a password-encrypted, self-contained
     * envelope. Format adheres to Rule 16 as a compact positional tuple:
     * [format, version, [algo, iterations, salt, iv], ciphertext]
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

        const version = EXPORT_VERSION;
        const bindingData = utf8ToBytes(`${EXPORT_FORMAT}/v${version}`);
        const [enc, encErr] = await Encryption.encrypt(docBytes, key, { additionalData: bindingData });
        if (encErr) return [null, encErr];

        const [tuple, packErr] = packExportEnvelope({
            format: EXPORT_FORMAT,
            version,
            kdf: {
                algo: KDF_ALGO,
                iterations: KeyDerivation.ITERATIONS,
                salt: bytesToBase64(salt),
                iv: bytesToBase64(enc.iv)
            },
            ciphertext: bytesToBase64(new Uint8Array(enc.ciphertext))
        });
        if (packErr) return [null, packErr];

        return [JSON.stringify(tuple), null];
    }

    /**
     * Rehydrates a vault from an encrypted export envelope.
     * Accepts Rule 16 positional tuples and legacy dictionary envelopes.
     *
     * @param {string|Array|Object} envelopeJson
     * @param {string} password
     * @returns {Promise<[PasswordVault|null, Error|null]>}
     */
    static async importEncrypted(envelopeJson, password) {
        if (typeof envelopeJson !== 'string' && !Array.isArray(envelopeJson) && (typeof envelopeJson !== 'object' || envelopeJson === null)) {
            return [null, new Error('Invalid export envelope: expected a JSON string')];
        }

        const [envelope, unpackErr] = unpackExportEnvelope(envelopeJson);
        if (unpackErr) return [null, unpackErr];

        const [saltBytes, saltErr] = base64ToBytes(envelope.kdf.salt);
        if (saltErr) return [null, saltErr];
        const [ivBytes, ivErr] = base64ToBytes(envelope.kdf.iv);
        if (ivErr) return [null, ivErr];
        const [cipherBytes, cipherErr] = base64ToBytes(envelope.ciphertext);
        if (cipherErr) return [null, cipherErr];

        const [key, deriveErr] = await KeyDerivation.deriveKey(password, saltBytes, { iterations: envelope.kdf.iterations });
        if (deriveErr) return [null, deriveErr];

        const bindingData = utf8ToBytes(`${envelope.format}/v${envelope.version}`);
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

        const [vault, vaultErr] = await PasswordVault.fromJSON(doc, true, password, null);
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

PasswordVault.packExportEnvelope = packExportEnvelope;
PasswordVault.unpackExportEnvelope = unpackExportEnvelope;
