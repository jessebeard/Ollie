/**
 * Carrier manifests: password-authenticated summaries of a vault's chunk set.
 *
 * A manifest is written into EVERY carrier's container metadata and is
 * HMAC-SHA256 authenticated under a key derived from the master password
 * with a dedicated salt. On load, all carriers' manifests must agree, verify,
 * and match every extracted chunk record — substituted, rolled-back, or
 * tampered carrier sets fail closed before any decryption is attempted.
 *
 * Canonical serialization (section 6.3 of container-wire-format.md) fixes
 * key order so MAC input is byte-stable across implementations:
 *   format, version, chunkSetId, total, revision, created,
 *   entries[{index, checksum}], share?, kdf{algo, iterations, salt}
 * The `mac` field never covers itself.
 */
import { KeyDerivation } from '../cryptography/pbkdf2.js';
import { importHmacKey, signBytes, verifyBytes } from '../cryptography/hmac.js';
import { bytesToBase64, base64ToBytes, utf8ToBytes } from '../../utils/encoding.js';

export const MANIFEST_FORMAT = 'ollie-manifest';
export const MANIFEST_VERSION = 1;

// Mirrors the wire-format spec section 3.2 KDF iteration bounds.
const MIN_KDF_ITERATIONS = 50000;
const MAX_KDF_ITERATIONS = 10000000;

function isUint32(v) {
    return Number.isInteger(v) && v >= 0 && v <= 0xFFFFFFFF;
}

function isNonEmptyString(v, maxLen = Infinity) {
    return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

/**
 * Derives the manifest MAC key from the master password and the manifest's
 * own recorded KDF parameters (dedicated salt; separate from KEK derivation).
 *
 * @param {string} password
 * @param {{algo: string, iterations: number, salt: string}} kdf
 * @returns {Promise<[CryptoKey|null, Error|null]>}
 */
async function deriveMacKey(password, kdf) {
    const [saltBytes] = base64ToBytes(kdf.salt);
    const [raw, rawErr] = await KeyDerivation.deriveRawBits(password, saltBytes, {
        iterations: kdf.iterations,
        bits: 256
    });
    if (rawErr) return [null, rawErr];
    return importHmacKey(raw);
}

/**
 * Serializes the manifest's MAC-covered core in canonical key order.
 * The `mac` field itself is excluded.
 *
 * @param {Object} manifest
 * @returns {[Uint8Array|null, Error|null]}
 */
export function canonicalManifestBytes(manifest) {
    if (!manifest || typeof manifest !== 'object') {
        return [null, new Error('manifest: expected an object')];
    }

    /** @type {Object} */
    const core = {
        format: manifest.format,
        version: manifest.version,
        chunkSetId: manifest.chunkSetId,
        total: manifest.total,
        revision: manifest.revision,
        created: manifest.created,
        entries: (manifest.entries || []).map(e => ({ index: e.index, checksum: e.checksum }))
    };

    if (manifest.share !== undefined) {
        core.share = {
            index: manifest.share.index,
            threshold: manifest.share.threshold,
            data: manifest.share.data
        };
    }

    if (manifest.kdf !== undefined) {
        core.kdf = {
            algo: manifest.kdf.algo,
            iterations: manifest.kdf.iterations,
            salt: manifest.kdf.salt
        };
    }

    return [utf8ToBytes(JSON.stringify(core)), null];
}

/**
 * Validates a manifest's structure before any cryptographic work.
 *
 * @param {Object} m
 * @returns {Error|null} Typed error, or null when structurally valid
 */
export function validateManifestStructure(m) {
    if (!m || typeof m !== 'object') return new Error('manifest: expected an object');
    if (m.format !== MANIFEST_FORMAT) return new Error('manifest: unknown format');
    if (m.version !== MANIFEST_VERSION) return new Error('manifest: unsupported version');
    if (!isNonEmptyString(m.chunkSetId, 64)) return new Error('manifest: bad chunkSetId');
    if (!Number.isInteger(m.total) || m.total < 1 || m.total > 4096) return new Error('manifest: bad total');
    if (!Array.isArray(m.entries) || m.entries.length !== m.total) {
        return new Error('manifest: entries length must equal total');
    }
    for (let i = 0; i < m.entries.length; i++) {
        const e = m.entries[i];
        if (!e || !Number.isInteger(e.index) || e.index !== i) {
            return new Error(`manifest: entry ${i} has non-ascending index`);
        }
        if (!isUint32(e.checksum)) return new Error(`manifest: entry ${i} checksum out of range`);
    }
    if (!Number.isInteger(m.revision) || m.revision < 0) return new Error('manifest: bad revision');
    if (!isNonEmptyString(m.created, 40)) return new Error('manifest: bad created');

    if (m.share !== undefined) {
        const s = m.share;
        if (!s || !Number.isInteger(s.index) || s.index < 1 ||
            !Number.isInteger(s.threshold) || s.threshold < 1 ||
            !isNonEmptyString(s.data, 512)) {
            return new Error('manifest: malformed share envelope');
        }
    }

    if (!m.kdf || typeof m.kdf !== 'object' || m.kdf.algo !== 'PBKDF2-SHA256' ||
        !Number.isInteger(m.kdf.iterations) ||
        m.kdf.iterations < MIN_KDF_ITERATIONS ||
        m.kdf.iterations > MAX_KDF_ITERATIONS ||
        !isNonEmptyString(m.kdf.salt, 64)) {
        return new Error('manifest: malformed kdf block');
    }

    if (!isNonEmptyString(m.mac, 128)) return new Error('manifest: missing mac');

    return null;
}

/**
 * Builds and signs a manifest for one chunk set.
 *
 * @param {Object} spec
 * @param {string} spec.chunkSetId - UUID binding this manifest to one save
 * @param {Array<{index: number, checksum: number}>} spec.records - One per carrier
 * @param {number} spec.revision - Vault document revision at save time
 * @param {string} spec.password - Master password (MAC key source)
 * @param {string} [spec.created] - ISO timestamp override (tests)
 * @param {{index: number, threshold: number, data: string}} [spec.share] - CSS envelope (H2)
 * @param {{algo: string, iterations: number, salt: string}} [spec.kdf] - Reuse one KDF block across a carrier set
 * @returns {Promise<[Object|null, Error|null]>}
 */
export async function createManifest(spec) {
    try {
        if (!spec || !isNonEmptyString(spec.chunkSetId, 64)) {
            return [null, new Error('manifest: chunkSetId required')];
        }
        if (!Array.isArray(spec.records) || spec.records.length < 1) {
            return [null, new Error('manifest: at least one chunk record required')];
        }
        const records = [...spec.records].sort((a, b) => a.index - b.index);
        for (let i = 0; i < records.length; i++) {
            if (!records[i] || records[i].index !== i || !isUint32(records[i].checksum)) {
                return [null, new Error(`manifest: record ${i} malformed or non-contiguous`)];
            }
        }
        if (!Number.isInteger(spec.revision) || spec.revision < 0) {
            return [null, new Error('manifest: revision must be a non-negative integer')];
        }
        if (typeof spec.password !== 'string' || spec.password.length === 0) {
            return [null, new Error('manifest: password required for signing')];
        }

        const [salt, saltErr] = spec.kdf
            ? [base64ToBytes(spec.kdf.salt), null]
            : await KeyDerivation.generateSalt();
        if (saltErr) return [null, saltErr];

        const kdf = spec.kdf
            ? {
                algo: 'PBKDF2-SHA256',
                iterations: spec.kdf.iterations,
                salt: spec.kdf.salt
            }
            : {
                algo: 'PBKDF2-SHA256',
                iterations: KeyDerivation.ITERATIONS,
                salt: bytesToBase64(salt)
            };

        const [macKey, keyErr] = await deriveMacKey(spec.password, kdf);
        if (keyErr) return [null, keyErr];

        /** @type {Object} */
        const unsigned = {
            format: MANIFEST_FORMAT,
            version: MANIFEST_VERSION,
            chunkSetId: spec.chunkSetId,
            total: records.length,
            revision: spec.revision,
            created: spec.created !== undefined ? spec.created : new Date().toISOString(),
            entries: records.map(r => ({ index: r.index, checksum: r.checksum }))
        };
        if (spec.share !== undefined) {
            unsigned.share = {
                index: spec.share.index,
                threshold: spec.share.threshold,
                data: spec.share.data
            };
        }
        unsigned.kdf = kdf;

        const [canonical, canonErr] = canonicalManifestBytes(unsigned);
        if (canonErr) return [null, canonErr];

        const [mac, macErr] = await signBytes(macKey, canonical);
        if (macErr) return [null, macErr];

        return [{ ...unsigned, mac: bytesToBase64(mac) }, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Verifies a manifest's structure and MAC under the given password.
 * Structural problems yield tuple errors; authentication failure yields false.
 *
 * @param {Object} manifest
 * @param {string} password
 * @returns {Promise<[boolean|null, Error|null]>}
 */
export async function verifyManifest(manifest, password) {
    const structural = validateManifestStructure(manifest);
    if (structural) return [null, structural];

    if (typeof password !== 'string' || password.length === 0) {
        return [null, new Error('manifest: password required for verification')];
    }

    const [macKey, keyErr] = await deriveMacKey(password, manifest.kdf);
    if (keyErr) return [null, keyErr];

    const [canonical, canonErr] = canonicalManifestBytes(manifest);
    if (canonErr) return [null, canonErr];

    const [storedMac] = base64ToBytes(manifest.mac);
    const [ok, err] = await verifyBytes(macKey, canonical, storedMac);
    if (err) return [null, err];
    return [ok === true, null];
}

/**
 * Binds extracted chunk records to a verified manifest: every record must
 * match its manifest entry exactly (index present, checksum identical).
 *
 * @param {Array<{index: number, checksum: number}>} records
 * @param {Object} manifest
 * @returns {[null, Error|null]} Tuple of [null, bindError]
 */
export function bindChunkRecords(records, manifest) {
    if (!Array.isArray(records) || records.length !== manifest.total) {
        return [null, new Error(`manifest: expected ${manifest.total} chunk records, got ${records ? records.length : 0}`)];
    }

    const byIndex = new Map();
    for (const r of records) {
        if (!r || !Number.isInteger(r.index) || !isUint32(r.checksum)) {
            return [null, new Error('manifest: malformed chunk record')];
        }
        byIndex.set(r.index, r.checksum);
    }

    for (const entry of manifest.entries) {
        const actual = byIndex.get(entry.index);
        if (actual === undefined) {
            return [null, new Error(`manifest: missing chunk record for index ${entry.index}`)];
        }
        if (actual !== entry.checksum) {
            return [null, new Error(
                `manifest: chunk ${entry.index} checksum ${actual} does not match manifest entry ${entry.checksum}`
            )];
        }
    }

    return [null, null];
}
