"use strict";

import { parseCsv } from '../../utils/csv.js';

/**
 * CSV import for password-manager exports.
 *
 * Detects the vendor profile from the header row and maps rows to vault
 * entry objects. Supported profiles: firefox, chrome (classic and Google
 * Password Manager layouts), apple, keepass, keepassxc, bitwarden,
 * lastpass, plus a generic chrome fallback for bare url/username/password
 * files.
 *
 * Mapping policy:
 * - title: native column when present, else URL hostname, else username,
 *   else "Imported entry N" (vault validation requires a non-empty title).
 * - timestamps normalized to ISO-8601 for the primary `created` field;
 *   remaining time columns preserved verbatim as customFields so no data
 *   is silently dropped.
 * - folder-ish columns (grouping/folder/group) become a "Folder"
   customField plus a tag from the last path segment; favorite flags
 *   become a "favorite" tag.
 * - LastPass-style bare Base32 TOTP secrets are wrapped into an
 *   otpauth:// URI so the existing TOTP engine can consume them.
 */

const VENDORS = {
    FIREFOX: 'firefox',
    CHROME: 'chrome',
    APPLE: 'apple',
    KEEPASS: 'keepass',
    KEEPASSXC: 'keepassxc',
    BITWARDEN: 'bitwarden',
    LASTPASS: 'lastpass'
};

const norm = (h) => String(h).trim().toLowerCase();

/**
 * Detects the vendor profile from a header row.
 * @param {string[]} headers
 * @returns {string} Vendor key or 'unknown'
 */
export function detectFormat(headers) {
    const H = new Set(headers.map(norm));
    const has = (...names) => names.some(n => H.has(n));

    if (has('title') && has('otpauth')) return VENDORS.APPLE;
    if (has('icon') || (has('group') && has('title'))) return VENDORS.KEEPASSXC;
    if (has('account') && has('login name')) return VENDORS.KEEPASS;
    if (has('type') && has('login_uri')) return VENDORS.BITWARDEN;
    if (has('extra') && has('grouping')) return VENDORS.LASTPASS;

    const coreLogin = has('username', 'login name', 'login_username') && has('password');
    if (coreLogin && (has('httprealm') || has('formactionorigin') || has('guid') ||
        has('timepasswordchanged') || has('timecreated'))) {
        return VENDORS.FIREFOX;
    }
    if (coreLogin && has('url', 'origin', 'login_uri', 'web site')) return VENDORS.CHROME;

    return 'unknown';
}

function hostnameOf(urlValue) {
    if (!urlValue) return null;
    try {
        const u = new URL(urlValue);
        if (u.hostname) return u.hostname;
    } catch { /* fall through */ }
    const stripped = urlValue.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const pathless = stripped.split('/')[0];
    return pathless.length > 0 ? pathless : null;
}

function epochToIso(value, divisor) {
    if (!value) return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return undefined;
    return new Date(Math.floor(n / divisor)).toISOString();
}

function isoOrUndefined(value) {
    if (!value) return undefined;
    const trimmed = value.trim();
    // Preserve vendor-written ISO strings byte-for-byte; normalize anything else.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(trimmed)) {
        return trimmed;
    }
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
}

const cell = (row, idx) => (idx >= 0 && idx < row.length ? row[idx].trim() : '');

function indexMap(headers) {
    const map = {};
    headers.forEach((h, i) => { map[norm(h)] = i; });
    return map;
}

function fallbackTitle(urlValue, username, rowIndex) {
    return hostnameOf(urlValue) || username || `Imported entry ${rowIndex}`;
}

function pushFolderInfo(entry, fullPath) {
    if (!fullPath) return;
    entry.customFields.push({ label: 'Folder', value: fullPath });
    const lastSegment = fullPath.split('/').filter(Boolean).pop();
    if (lastSegment && !entry.tags.includes(lastSegment)) {
        entry.tags.push(lastSegment);
    }
}

function normalizeTotp(rawSecret, title) {
    if (!rawSecret) return undefined;
    if (/^otpauth:\/\//i.test(rawSecret)) return rawSecret;
    if (/^[A-Z2-7]+=*$/i.test(rawSecret) && rawSecret.replace(/=+$/, '').length >= 16) {
        return `otpauth://totp/${encodeURIComponent(title)}?secret=${rawSecret}`;
    }
    return undefined;
}

/**
 * @typedef {[Object|null, Error|null]} MapperResult
 */

/**
 * Per-vendor row mappers. `get(name)` fetches a trimmed cell by any of the
 * vendor's header spellings (lookup is normalized). rowIndex feeds the
 * positional title fallback.
 *
 * @type {Record<string, (get: function(string): string, idx: Object, rowIndex: number) => MapperResult>}
 */
const MAPPERS = {
    [VENDORS.FIREFOX]: (get, idx, rowIndex) => {
        const url = get('url') || get('origin');
        const username = get('username');
        const entry = baseEntry(fallbackTitle(url, username, rowIndex), {
            url: url || undefined,
            username: username || undefined,
            password: get('password') || undefined
        });
        entry.created = epochToIso(get('timeCreated'), 1);
        for (const p of ['httpRealm', 'formActionOrigin', 'guid', 'timeLastUsed', 'timePasswordChanged']) {
            const v = get(p);
            if (v) entry.customFields.push({ label: p, value: v });
        }
        return [entry, null];
    },

    [VENDORS.CHROME]: (get, idx, rowIndex) => {
        const url = get('url');
        const name = get('name');
        const username = get('username');
        const entry = baseEntry(name || fallbackTitle(url, username, rowIndex), {
            url: url || undefined,
            username: username || undefined,
            password: get('password') || undefined,
            notes: get('note') || undefined
        });
        entry.created = epochToIso(get('first_detection_time'), 1000);
        const lastUsed = get('last_used_time');
        if (lastUsed) entry.customFields.push({ label: 'last_used_time', value: lastUsed });
        return [entry, null];
    },

    [VENDORS.APPLE]: (get) => {
        const entry = baseEntry(get('Title'), {
            url: get('URL') || undefined,
            username: get('Username') || undefined,
            password: get('Password') || undefined,
            notes: get('Notes') || undefined,
            totp: normalizeTotp(get('OTPAuth'), get('Title'))
        });
        return [entry, null];
    },

    [VENDORS.KEEPASS]: (get) => {
        const entry = baseEntry(get('Account'), {
            url: get('Web Site') || undefined,
            username: get('Login Name') || undefined,
            password: get('Password') || undefined,
            notes: get('Comments') || undefined
        });
        return [entry, null];
    },

    [VENDORS.KEEPASSXC]: (get) => {
        const title = get('Title');
        const entry = baseEntry(title, {
            url: get('URL') || undefined,
            username: get('Username') || undefined,
            password: get('Password') || undefined,
            notes: get('Notes') || undefined,
            totp: normalizeTotp(get('TOTP'), title)
        });
        entry.created = isoOrUndefined(get('Created'));
        const modified = isoOrUndefined(get('Last Modified'));
        if (modified) entry.modified = modified;
        pushFolderInfo(entry, get('Group'));
        const icon = get('Icon');
        if (icon) entry.customFields.push({ label: 'Icon', value: icon });
        return [entry, null];
    },

    [VENDORS.BITWARDEN]: (get) => {
        const type = norm(get('type'));
        if (type === 'card' || type === 'identity') {
            return [null, new Error(`todo(card-identity-import): Bitwarden type=${type} not mapped yet`) ];
        }
        const title = get('name');
        const entry = baseEntry(title, {
            url: get('login_uri') || undefined,
            username: get('login_username') || undefined,
            password: get('login_password') || undefined,
            notes: get('notes') || undefined,
            totp: normalizeTotp(get('login_totp'), title)
        });
        if (norm(get('favorite')) === '1') entry.tags.push('favorite');
        pushFolderInfo(entry, get('folder'));
        for (const pair of (get('fields') || '').split('\n')) {
            const eq = pair.indexOf('=');
            if (eq > 0) {
                entry.customFields.push({ label: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() });
            }
        }
        return [entry, null];
    },

    [VENDORS.LASTPASS]: (get, _idx, rowIndex) => {
        const url = get('url');
        const name = get('name');
        const username = get('username');
        const title = name || fallbackTitle(url, username, rowIndex);
        const entry = baseEntry(title, {
            url: url || undefined,
            username: username || undefined,
            password: get('password') || undefined,
            notes: get('extra') || undefined,
            totp: normalizeTotp(get('totp'), title)
        });
        if (norm(get('fav')) === '1') entry.tags.push('favorite');
        pushFolderInfo(entry, get('grouping'));
        return [entry, null];
    }
};

function baseEntry(title, fields) {
    const entry = {
        title,
        tags: [],
        customFields: []
    };
    for (const k of Object.keys(fields)) {
        if (fields[k] !== undefined && fields[k] !== '') entry[k] = fields[k];
    }
    return entry;
}

/**
 * Parses a CSV export and maps it to vault entries.
 * @param {string} text Raw CSV document
 * @returns {Promise<[Object|null, Error|null]>} Tuple of [{entries, skipped, format}, error]
 */
export async function importFromCsv(text) {
    let rows;
    {
        const [firstRows, parseErr] = parseCsv(text);
        if (parseErr) return [null, parseErr];
        rows = firstRows;
    }
    if (rows.length === 0) return [null, new Error('csv-import: no rows found')];

    const headers = rows[0].map(h => String(h));
    const format = detectFormat(headers);
    if (format === 'unknown' || !MAPPERS[format]) {
        return [null, new Error(
            `csv-import: unsupported header layout (${headers.join(', ')}). ` +
            'Supported vendors: Firefox, Chrome/Google Password Manager, Apple Passwords, KeePass, KeePassXC, Bitwarden, LastPass.'
        )];
    }

    if (format === VENDORS.KEEPASS) {
        const [kpRows, kpErr] = parseCsv(text, { escapeStyle: 'keepass' });
        if (!kpErr) rows = kpRows;
    }

    const idx = indexMap(headers);
    const get = (row, name) => cell(row, idx[norm(name)]);

    const entries = [];
    const skipped = [];
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];

        if (idx['type'] !== undefined && format === VENDORS.BITWARDEN) {
            const t = norm(cell(row, idx['type']));
            if (t === 'card' || t === 'identity') {
                skipped.push({ row: r + 1, reason: `todo(card-identity-import): Bitwarden type=${t} not mapped yet` });
                continue;
            }
        }

        if (row.length !== headers.length) {
            skipped.push({
                row: r + 1,
                reason: `expected ${headers.length} columns, got ${row.length}`
            });
            continue;
        }
        if (row.every(c => c.trim() === '')) {
            skipped.push({ row: r + 1, reason: 'empty row' });
            continue;
        }

        try {
            const [entry, mapErr] = MAPPERS[format](name => get(row, name), idx, r + 1);
            if (mapErr) {
                skipped.push({ row: r + 1, reason: mapErr.message });
            } else if (entry) {
                entries.push(entry);
            }
        } catch (e) {
            skipped.push({ row: r + 1, reason: e.message });
        }
    }

    return [{ entries, skipped, format }, null];
}
