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

/**
 * Positional Indices for Format v4.1 Manifest Tuples (Rule 16: Positional Serialized Arrays):
 * [0]  format      - 'ollie-manifest' (string)
 * [1]  version     - integer version (number)
 * [2]  chunkSetId  - UUID (string)
 * [3]  total       - total chunk count (uint32)
 * [4]  revision    - revision number (uint32)
 * [5]  created     - ISO 8601 string or numeric timestamp
 * [6]  entries     - Array of [index: number, checksum: number] tuples
 * [7]  kdf         - [algo: string, iterations: number, salt: string] | null
 * [8]  ec          - [k: number, n: number, size: number] | null
 * [9]  shares      - Array of [index: number, threshold: number, data: string] | null
 * [10] mac         - HMAC-SHA256 base64 string | null
 */
export const MANIFEST_TUPLE_FORMAT = 0;
export const MANIFEST_TUPLE_VERSION = 1;
export const MANIFEST_TUPLE_CHUNK_SET_ID = 2;
export const MANIFEST_TUPLE_TOTAL = 3;
export const MANIFEST_TUPLE_REVISION = 4;
export const MANIFEST_TUPLE_CREATED = 5;
export const MANIFEST_TUPLE_ENTRIES = 6;
export const MANIFEST_TUPLE_KDF = 7;
export const MANIFEST_TUPLE_EC = 8;
export const MANIFEST_TUPLE_SHARES = 9;
export const MANIFEST_TUPLE_MAC = 10;
export const MANIFEST_TUPLE_LENGTH = 11;
export const MANIFEST_CORE_TUPLE_LENGTH = 10;

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
 * Packs an internal manifest record into a compact positional array tuple.
 * Eliminates labeled JSON string keys from storage and wire representations.
 *
 * @param {Object|Array} manifest
 * @returns {[Array|null, Error|null]}
 */
export function packManifest(manifest) {
    if (!manifest) return [null, new Error('manifest: manifest required')];
    if (Array.isArray(manifest)) return [manifest, null];
    if (typeof manifest !== 'object') return [null, new Error('manifest: expected an object')];

    const entriesTuple = Array.isArray(manifest.entries)
        ? manifest.entries.map(e => Array.isArray(e) ? e : [e.index, e.checksum])
        : [];
    const kdfTuple = manifest.kdf
        ? (Array.isArray(manifest.kdf) ? manifest.kdf : [manifest.kdf.algo, manifest.kdf.iterations, manifest.kdf.salt])
        : null;
    const ecTuple = manifest.ec
        ? (Array.isArray(manifest.ec) ? manifest.ec : [manifest.ec.k, manifest.ec.n, manifest.ec.size])
        : null;

    let rawShares = manifest.shares;
    if (!rawShares && manifest.share) {
        rawShares = [manifest.share];
    }
    const sharesTuple = Array.isArray(rawShares)
        ? rawShares.map(s => (Array.isArray(s) ? s : [s.index, s.threshold, s.data]))
        : null;

    const tuple = [
        manifest.format || MANIFEST_FORMAT,
        Number.isInteger(manifest.version) ? manifest.version : MANIFEST_VERSION,
        manifest.chunkSetId || '',
        Number.isInteger(manifest.total) ? manifest.total : entriesTuple.length,
        Number.isInteger(manifest.revision) ? manifest.revision : 0,
        manifest.created !== undefined ? manifest.created : new Date().toISOString(),
        entriesTuple,
        kdfTuple,
        ecTuple,
        sharesTuple,
        manifest.mac || null
    ];

    return [tuple, null];
}

/**
 * Unpacks and strictly validates a positional manifest tuple into an internal record.
 * Fails closed on any unexpected length, type mismatch, or invariant deviation.
 *
 * @param {Array|Object} input - Positional manifest tuple (or legacy manifest object)
 * @returns {[Object|null, Error|null]}
 */
export function unpackManifest(input) {
    if (!input) return [null, new Error('manifest: input required')];
    if (typeof input === 'object' && !Array.isArray(input)) {
        return [input, null];
    }
    if (!Array.isArray(input)) {
        return [null, new Error('manifest: expected an array tuple')];
    }
    if (input.length !== MANIFEST_TUPLE_LENGTH && input.length !== 12) {
        return [null, new Error(`manifest: invalid tuple length ${input.length}, expected ${MANIFEST_TUPLE_LENGTH}`)];
    }

    let format, version, chunkSetId, total, revision, created, entriesRaw, kdfRaw, ecRaw, sharesRaw, mac;

    if (input.length === 12) {
        let shareRaw;
        [format, version, chunkSetId, total, revision, created, entriesRaw, kdfRaw, ecRaw, sharesRaw, shareRaw, mac] = input;
        if (!sharesRaw && shareRaw) {
            sharesRaw = [shareRaw];
        }
    } else {
        [format, version, chunkSetId, total, revision, created, entriesRaw, kdfRaw, ecRaw, sharesRaw, mac] = input;
    }

    if (format !== MANIFEST_FORMAT) {
        return [null, new Error('manifest: unknown format')];
    }
    if (version !== MANIFEST_VERSION) {
        return [null, new Error('manifest: unsupported version')];
    }
    if (!isNonEmptyString(chunkSetId, 64)) {
        return [null, new Error('manifest: bad chunkSetId')];
    }
    if (!Number.isInteger(total) || total < 1 || total > 4096) {
        return [null, new Error('manifest: bad total')];
    }
    if (!Number.isInteger(revision) || revision < 0) {
        return [null, new Error('manifest: bad revision')];
    }
    if (typeof created !== 'string' && !Number.isInteger(created)) {
        return [null, new Error('manifest: bad created')];
    }

    let entries = [];
    if (Array.isArray(entriesRaw)) {
        entries = new Array(entriesRaw.length);
        for (let i = 0; i < entriesRaw.length; i++) {
            const e = entriesRaw[i];
            if (Array.isArray(e) && e.length === 2) {
                entries[i] = { index: e[0], checksum: e[1] };
            } else if (e && typeof e === 'object') {
                entries[i] = { index: e.index, checksum: e.checksum };
            } else {
                return [null, new Error(`manifest: entry ${i} malformed`)];
            }
        }
    }

    let kdf = undefined;
    if (Array.isArray(kdfRaw) && kdfRaw.length === 3) {
        kdf = { algo: kdfRaw[0], iterations: kdfRaw[1], salt: kdfRaw[2] };
    } else if (kdfRaw && typeof kdfRaw === 'object' && !Array.isArray(kdfRaw)) {
        kdf = kdfRaw;
    }

    let ec = undefined;
    if (Array.isArray(ecRaw) && ecRaw.length === 3) {
        ec = { k: ecRaw[0], n: ecRaw[1], size: ecRaw[2] };
    } else if (ecRaw && typeof ecRaw === 'object' && !Array.isArray(ecRaw)) {
        ec = ecRaw;
    }

    let shares = undefined;
    if (Array.isArray(sharesRaw)) {
        shares = sharesRaw.map(s => {
            if (Array.isArray(s) && s.length === 3) {
                return { index: s[0], threshold: s[1], data: s[2] };
            }
            return s;
        });
    }

    const share = (shares && shares.length > 0) ? shares[0] : undefined;

    const manifestObj = {
        format,
        version,
        chunkSetId,
        total,
        revision,
        created,
        entries,
        ...(kdf ? { kdf } : {}),
        ...(ec ? { ec } : {}),
        ...(shares ? { shares } : {}),
        ...(share ? { share } : {}),
        ...(mac ? { mac } : {})
    };

    return [manifestObj, null];
}

/**
 * Derives the manifest MAC key from the master password and the manifest's
 * own recorded KDF parameters (dedicated salt; separate from KEK derivation).
 *
 * @param {string} password
 * @param {{algo: string, iterations: number, salt: string}} kdf
 * @returns {Promise<[CryptoKey|null, Error|null]>}
 */
export async function deriveMacKey(password, kdf) {
    if (typeof password !== 'string' || password.length === 0) {
        return [null, new Error('deriveMacKey: password required')];
    }
    if (!kdf || typeof kdf !== 'object' || !kdf.salt || !kdf.iterations) {
        return [null, new Error('deriveMacKey: malformed kdf parameters')];
    }

    const [saltBytes, saltErr] = base64ToBytes(kdf.salt);
    if (saltErr || !saltBytes) {
        return [null, saltErr || new Error('deriveMacKey: invalid salt')];
    }

    const [raw, rawErr] = await KeyDerivation.deriveRawBits(password, saltBytes, {
        iterations: kdf.iterations,
        bits: 256
    });
    if (rawErr || !raw) return [null, rawErr || new Error('deriveMacKey: derivation failed')];

    return await importHmacKey(raw);
}

/**
 * Serializes the manifest's MAC-covered core in canonical key order.
 * The `mac` field itself is excluded.
 *
 * @param {Object} manifest
 * @returns {[Uint8Array|null, Error|null]}
 */
export function canonicalManifestBytes(manifest) {
    if (!manifest) {
        return [null, new Error('manifest: expected an object or array')];
    }

    if (Array.isArray(manifest)) {
        if (manifest.length !== MANIFEST_TUPLE_LENGTH && manifest.length !== MANIFEST_CORE_TUPLE_LENGTH && manifest.length !== 12 && manifest.length !== 11) {
            return [null, new Error(`manifest: invalid tuple length ${manifest.length}`)];
        }
        const coreTuple = manifest.length === MANIFEST_TUPLE_LENGTH
            ? manifest.slice(0, MANIFEST_CORE_TUPLE_LENGTH)
            : (manifest.length === 12 ? manifest.slice(0, 11) : manifest);
        return [utf8ToBytes(JSON.stringify(coreTuple)), null];
    }

    if (typeof manifest !== 'object') {
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

    if (manifest.ec !== undefined) {
        core.ec = {
            k: manifest.ec.k,
            n: manifest.ec.n,
            size: manifest.ec.size
        };
    }

    if (manifest.shares !== undefined) {
        core.shares = manifest.shares.map(s => ({
            index: s.index,
            threshold: s.threshold,
            data: s.data
        }));
    } else if (manifest.share !== undefined) {
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
    if (!m) return new Error('manifest: expected an object');
    if (Array.isArray(m)) {
        const [, err] = unpackManifest(m);
        return err;
    }
    if (typeof m !== 'object') return new Error('manifest: expected an object');
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

    if (m.shares !== undefined) {
        if (!Array.isArray(m.shares) || m.shares.length < 1) {
            return new Error('manifest: malformed shares array');
        }
        for (const s of m.shares) {
            if (!s || !Number.isInteger(s.index) || s.index < 1 ||
                !Number.isInteger(s.threshold) || s.threshold < 1 ||
                !isNonEmptyString(s.data, 512)) {
                return new Error('manifest: malformed share envelope in shares');
            }
        }
    } else if (m.share !== undefined) {
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
 * @param {string} [spec.password] - Master password (MAC key source)
 * @param {CryptoKey} [spec.macKey] - Optional pre-derived HMAC key (ephemeral, avoids re-deriving)
 * @param {string} [spec.created] - ISO timestamp override (tests)
 * @param {{index: number, threshold: number, data: string}} [spec.share] - CSS envelope (H2)
 * @param {Array<{index: number, threshold: number, data: string}>} [spec.shares] - Per-carrier CSS key shares (erasure sets)
 * @param {{algo: string, iterations: number, salt: string}} [spec.kdf] - Reuse one KDF block across a carrier set
 * @param {{k: number, n: number, size: number}} [spec.ec] - Erasure-coding parameters for threshold sets
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
        let macKey = spec.macKey || null;
        if (!macKey) {
            if (typeof spec.password !== 'string' || spec.password.length === 0) {
                return [null, new Error('manifest: password required for signing')];
            }
        }

        let salt;
        let saltErr = null;
        if (spec.kdf) {
            const [b, err] = base64ToBytes(spec.kdf.salt);
            salt = b;
            saltErr = err;
        } else {
            const [b, err] = await KeyDerivation.generateSalt();
            salt = b;
            saltErr = err;
        }
        if (saltErr || !salt) return [null, saltErr || new Error('manifest: failed to resolve salt')];

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

        if (!macKey) {
            const [derived, keyErr] = await deriveMacKey(spec.password, kdf);
            if (keyErr || !derived) return [null, keyErr || new Error('manifest: key derivation failed')];
            macKey = derived;
        }

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
        if (spec.ec !== undefined) {
            unsigned.ec = { k: spec.ec.k, n: spec.ec.n, size: spec.ec.size };
        }
        if (spec.shares !== undefined) {
            unsigned.shares = spec.shares.map(s => ({
                index: s.index,
                threshold: s.threshold,
                data: s.data
            }));
        } else if (spec.share !== undefined) {
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
 * Verifies a manifest's structure and MAC under the given password or pre-derived CryptoKey.
 * Structural problems yield tuple errors; authentication failure yields false.
 *
 * @param {Object|Array} manifestOrTuple
 * @param {string|CryptoKey} passwordOrKey
 * @param {Object} [options]
 * @param {CryptoKey} [options.macKey] - Optional pre-derived HMAC key (ephemeral, avoids re-deriving)
 * @returns {Promise<[boolean|null, Error|null]>}
 */
export async function verifyManifest(manifestOrTuple, passwordOrKey, options = {}) {
    let manifest = manifestOrTuple;
    if (Array.isArray(manifestOrTuple)) {
        const [unpacked, err] = unpackManifest(manifestOrTuple);
        if (err || !unpacked) return [null, err || new Error('manifest: unpack failed')];
        manifest = unpacked;
    }

    const structural = validateManifestStructure(manifest);
    if (structural) return [null, structural];

    let macKey = (options && options.macKey) || null;
    if (!macKey) {
        if (typeof passwordOrKey === 'string') {
            if (passwordOrKey.length === 0) {
                return [null, new Error('manifest: password required for verification')];
            }
            const [derived, keyErr] = await deriveMacKey(passwordOrKey, manifest.kdf);
            if (keyErr || !derived) return [null, keyErr || new Error('manifest: key derivation failed')];
            macKey = derived;
        } else if (passwordOrKey && typeof passwordOrKey === 'object') {
            macKey = passwordOrKey;
        } else {
            return [null, new Error('manifest: password required for verification')];
        }
    }

    const [canonical, canonErr] = canonicalManifestBytes(manifest);
    if (canonErr) return [null, canonErr];

    const [storedMac] = base64ToBytes(manifest.mac);
    const [ok, err] = await verifyBytes(macKey, canonical, storedMac);
    if (err) return [null, err];
    return [ok === true, null];
}

/**
 * Binds extracted chunk records to a verified manifest.
 *
 * Strict mode (default): records must cover every manifest entry exactly.
 * Subset mode ({subset:true}): used by erasure-coded sets, where only some
 * of the n coded stripes are present; every provided record must match its
 * entry exactly and indices must be unique, but coverage is partial by
 * design.
 *
 * @param {Array<{index: number, checksum: number}>} records
 * @param {Object} manifest
 * @param {{subset?: boolean}} [options]
 * @returns {[null, Error|null]} Tuple of [null, bindError]
 */
export function bindChunkRecords(records, manifest, options = {}) {
    const subset = !!(options && options.subset);

    if (!Array.isArray(records)) {
        return [null, new Error('manifest: expected an array of chunk records')];
    }
    if (!subset && records.length !== manifest.total) {
        return [null, new Error(`manifest: expected ${manifest.total} chunk records, got ${records.length}`)];
    }
    if (records.length > manifest.total) {
        return [null, new Error(`manifest: ${records.length} records exceed the ${manifest.total} coded chunks`)];
    }

    const byIndex = new Map();
    for (const r of records) {
        if (!r || !Number.isInteger(r.index) || !isUint32(r.checksum)) {
            return [null, new Error('manifest: malformed chunk record')];
        }
        if (byIndex.has(r.index)) {
            return [null, new Error(`manifest: duplicate chunk record for index ${r.index}`)];
        }
        byIndex.set(r.index, r.checksum);
    }

    // Strict mode demands full coverage; subset mode only requires that
    // whatever IS present matches its manifest entry exactly.
    const entriesToCheck = subset
        ? manifest.entries.filter(e => byIndex.has(e.index))
        : manifest.entries;

    for (const entry of entriesToCheck) {
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
