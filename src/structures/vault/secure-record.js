import { Encryption } from '../../information-theory/cryptography/aes-gcm.js';
import { bytesToBase64, base64ToBytes, utf8ToBytes } from '../../utils/encoding.js';

function isNonEmptyString(value) {
    return typeof value === 'string';
}

export class SecureEntry {
    // Declared for type-checking; populated via Object.assign in the constructor.
    /** @type {string} */ id;
    /** @type {string} */ title;
    /** @type {string} */ url;
    /** @type {string} */ username;
    /** @type {string[]} */ tags;
    /** @type {string} */ created;
    /** @type {string} */ modified;
    /** @type {{ciphertext: Uint8Array, iv: Uint8Array}|null} */
    _encrypted = null;

    /**
     * @private
     * Use SecureEntry.create() instead.
     */
    constructor(publicFields, encryptedFields) {
        Object.assign(this, publicFields);

        // Hide encrypted fields in a property and freeze it
        Object.defineProperty(this, '_encrypted', {
            value: Object.freeze(encryptedFields),
            enumerable: false,
            writable: false,
            configurable: false
        });

        // Freeze arrays to ensure complete structural immutability
        if (this.tags) {
            Object.freeze(this.tags);
        }

        Object.freeze(this);
    }

    /**
     * Asynchronously creates a new SecureEntry by encrypting sensitive fields.
     * The entry id is bound into the AES-GCM authentication data so a
     * ciphertext cannot be transplanted onto another entry.
     *
     * @param {Object} plaintextEntry
     * @param {CryptoKey} key
     * @returns {Promise<[SecureEntry|null, Error|null]>}
     */
    static async create(plaintextEntry, key) {
        try {
            if (!plaintextEntry || typeof plaintextEntry !== 'object') {
                return [null, new Error('Invalid entry data')];
            }

            const publicFields = {
                id: plaintextEntry.id || '',
                title: plaintextEntry.title || '',
                url: plaintextEntry.url || '',
                username: plaintextEntry.username || '',
                tags: Array.isArray(plaintextEntry.tags) ? [...plaintextEntry.tags] : [],
                created: plaintextEntry.created || new Date().toISOString(),
                modified: plaintextEntry.modified || new Date().toISOString()
            };

            const sensitiveFields = {
                password: typeof plaintextEntry.password === 'string' ? plaintextEntry.password : '',
                notes: typeof plaintextEntry.notes === 'string' ? plaintextEntry.notes : '',
                totp: typeof plaintextEntry.totp === 'string' ? plaintextEntry.totp : '',
                customFields: Array.isArray(plaintextEntry.customFields) ? [...plaintextEntry.customFields] : []
            };

            const jsonStr = JSON.stringify(sensitiveFields);
            const bytes = utf8ToBytes(jsonStr);
            const bindingData = utf8ToBytes(publicFields.id);

            const [encrypted, encErr] = await Encryption.encrypt(bytes, key, { additionalData: bindingData });
            if (encErr) return [null, encErr];

            // Deep clone buffers into frozen view
            const encryptedFields = {
                ciphertext: new Uint8Array(encrypted.ciphertext),
                iv: new Uint8Array(encrypted.iv)
            };

            const entry = new SecureEntry(publicFields, encryptedFields);
            return [entry, null];
        } catch (e) {
            return [null, e];
        }
    }

    /**
     * Asynchronously decrypts the SecureEntry and returns the full plaintext representation.
     * @param {CryptoKey} key
     * @returns {Promise<[Object|null, Error|null]>}
     */
    async decrypt(key) {
        try {
            const { ciphertext, iv } = this._encrypted;
            const bindingData = utf8ToBytes(this.id);

            const [decryptedBytes, decErr] = await Encryption.decrypt(ciphertext, key, iv, { additionalData: bindingData });
            if (decErr) return [null, decErr];

            const jsonStr = new TextDecoder().decode(decryptedBytes);
            const sensitiveFields = JSON.parse(jsonStr);

            const plaintextEntry = {
                id: this.id,
                title: this.title,
                url: this.url,
                username: this.username,
                tags: [...this.tags],
                created: this.created,
                modified: this.modified,
                password: sensitiveFields.password,
                notes: sensitiveFields.notes,
                totp: sensitiveFields.totp,
                customFields: sensitiveFields.customFields
            };

            return [plaintextEntry, null];
        } catch (e) {
            return [null, e];
        }
    }

    /**
     * Serializes the SecureEntry for storage. Encrypted material is
     * base64-encoded; the legacy number-array form is not produced.
     */
    toJSON() {
        return {
            id: this.id,
            title: this.title,
            url: this.url,
            username: this.username,
            tags: this.tags,
            created: this.created,
            modified: this.modified,
            _encrypted: this._encrypted ? {
                ciphertext: bytesToBase64(this._encrypted.ciphertext),
                iv: bytesToBase64(this._encrypted.iv)
            } : null
        };
    }

    /**
     * Rehydrates a SecureEntry from JSON storage.
     *
     * @returns {[SecureEntry|null, Error|null]} Tuple of [entry, error]
     */
    static fromJSON(data) {
        if (!data || typeof data !== 'object') {
            return [null, new Error('Invalid vault entry: expected an object')];
        }

        for (const field of ['id', 'title', 'url', 'username', 'created', 'modified']) {
            if (!isNonEmptyString(data[field])) {
                return [null, new Error(`Invalid vault entry: field "${field}" must be a string`)];
            }
        }

        if (!Array.isArray(data.tags)) {
            return [null, new Error('Invalid vault entry: field "tags" must be an array')];
        }
        if (data.tags.some(t => !isNonEmptyString(t))) {
            return [null, new Error('Invalid vault entry: all tags must be strings')];
        }

        if (!data._encrypted || typeof data._encrypted !== 'object' ||
            !isNonEmptyString(data._encrypted.ciphertext) ||
            !isNonEmptyString(data._encrypted.iv)) {
            return [null, new Error('Invalid vault entry: missing or malformed _encrypted block')];
        }

        const publicFields = {
            id: data.id,
            title: data.title,
            url: data.url,
            username: data.username,
            tags: [...data.tags],
            created: data.created,
            modified: data.modified
        };

        const [ciphertext] = base64ToBytes(data._encrypted.ciphertext);
        const [iv] = base64ToBytes(data._encrypted.iv);
        const encryptedFields = { ciphertext, iv };

        return [new SecureEntry(publicFields, encryptedFields), null];
    }
}
