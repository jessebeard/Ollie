import { Encryption } from '../crypto/encryption.js';

export class SecureEntry {
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
            const bytes = new TextEncoder().encode(jsonStr);

            const [encrypted, encErr] = await Encryption.encrypt(bytes, key);
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

            const [decryptedBytes, decErr] = await Encryption.decrypt(ciphertext, key, iv);
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
     * Serializes the SecureEntry for storage.
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
                ciphertext: Array.from(this._encrypted.ciphertext),
                iv: Array.from(this._encrypted.iv)
            } : null
        };
    }

    /**
     * Rehydrates a SecureEntry from JSON storage.
     */
    static fromJSON(data) {
        const publicFields = {
            id: data.id,
            title: data.title,
            url: data.url,
            username: data.username,
            tags: data.tags,
            created: data.created,
            modified: data.modified
        };

        const encryptedFields = data._encrypted ? {
            ciphertext: new Uint8Array(data._encrypted.ciphertext),
            iv: new Uint8Array(data._encrypted.iv)
        } : {
            ciphertext: new Uint8Array(0),
            iv: new Uint8Array(0)
        };

        return new SecureEntry(publicFields, encryptedFields);
    }
}
