"use strict";

/**
 * Minimal CSV parser for password-manager import files.
 *
 * Implements RFC 4180 semantics by default: comma delimiters, CRLF or LF
 * row terminators, double-quote field enclosure, doubled-quote escaping,
 * and embedded newlines inside quoted fields. A UTF-8 byte-order mark at
 * the start of the input is stripped.
 *
 * `escapeStyle: 'keepass'` switches quoted-field decoding to the KeePass
 * 1.x dialect, where literal quotes are written as backslash-quote and
 * literal backslashes as double backslash; doubled quotes are NOT escapes
 * in that mode.
 *
 * Rows are returned verbatim (ragged row lengths are preserved) so callers
 * decide their own validation policy. Fully empty lines are skipped.
 *
 * @param {string} text Raw CSV document
 * @param {{escapeStyle?: 'rfc'|'keepass'}} [options]
 * @returns {[string[][]|null, Error|null]} Tuple of [rows, error]
 */
export function parseCsv(text, options) {
    if (typeof text !== 'string') {
        return [null, new Error('csv: input must be a string')];
    }
    const escapeStyle = options && options.escapeStyle === 'keepass' ? 'keepass' : 'rfc';

    let input = text;
    if (input.charCodeAt(0) === 0xFEFF) {
        input = input.slice(1);
    }
    if (input.trim().length === 0) {
        return [null, new Error('csv: input is empty')];
    }

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let sawAnything = false;

    const endField = () => {
        row.push(field);
        field = '';
        sawAnything = true;
    };
    const endRow = () => {
        if (sawAnything || field.length > 0) {
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
            sawAnything = false;
        }
    };

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (inQuotes) {
            if (escapeStyle === 'keepass' && ch === '\\' && i + 1 < input.length) {
                field += input[i + 1];
                i++;
                continue;
            }
            if (ch === '"') {
                if (escapeStyle === 'rfc' && input[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
                continue;
            }
            field += ch;
            continue;
        }

        if (ch === '"' && field.length === 0) {
            inQuotes = true;
            continue;
        }
        if (ch === ',') {
            endField();
            continue;
        }
        if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && input[i + 1] === '\n') i++;
            endRow();
            continue;
        }
        field += ch;
    }

    if (inQuotes) {
        return [null, new Error('csv: unterminated quoted field (missing closing quote)')];
    }
    endRow();

    return [rows, null];
}
