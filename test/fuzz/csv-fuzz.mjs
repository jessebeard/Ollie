import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { parseCsv } from '../../src/utils/csv.js';
import { importFromCsv, detectFormat } from '../../src/structures/vault/csv-import.js';

/**
 * CSV Import & Parser Fuzz Suite: Hostile text resilience, vendor header detection,
 * and entry mapping conservation.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runCsvFuzz(scale = 1) {
    const iters = Math.max(10, Math.floor(25 * scale));

    // 1. Hostile strings to parseCsv never throw and always yield typed tuple
    await assertProperty(
        [Arbitrary.string(0, 500)],
        async (hostileText) => {
            const [rows, err] = parseCsv(hostileText);
            if (err) {
                if (!(err instanceof Error)) throw new Error('Expected Error instance in tuple');
                if (rows !== null) throw new Error('Expected null rows when error is present');
            } else {
                if (!Array.isArray(rows)) throw new Error('Expected array of rows on success');
            }
        },
        iters
    );

    // 2. Arbitrary strings to importFromCsv never throw unhandled exceptions
    await assertProperty(
        [Arbitrary.string(0, 500)],
        async (hostileText) => {
            const [res, err] = await importFromCsv(hostileText);
            if (err) {
                if (!(err instanceof Error)) throw new Error('Expected Error instance in tuple');
                if (res !== null) throw new Error('Expected null result when error is present');
            } else {
                if (!res || !Array.isArray(res.entries) || !Array.isArray(res.skipped)) {
                    throw new Error('Malformed importFromCsv result object');
                }
            }
        },
        iters
    );

    // 3. Structured vendor CSV generators preserve row mapping
    const vendorHeaders = [
        { format: 'chrome', header: 'name,url,username,password,note' },
        { format: 'firefox', header: 'url,username,password,httpRealm,formActionOrigin,guid,timeCreated,timeLastUsed,timePasswordChanged' },
        { format: 'bitwarden', header: 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp' },
        { format: 'keepass', header: '"Account","Login Name","Password","Web Site","Comments"' },
        { format: 'apple', header: 'Title,URL,Username,Password,Notes,OTPAuth' }
    ];

    for (const v of vendorHeaders) {
        const [parsedHeader] = parseCsv(v.header);
        const headers = parsedHeader[0];
        const detected = detectFormat(headers);
        if (detected !== v.format) {
            throw new Error(`detectFormat mismatch for ${v.format}: got ${detected}`);
        }

        // Build a 5-row CSV document
        const lines = [v.header];
        const numCols = headers.length;
        for (let r = 1; r <= 5; r++) {
            const rowCells = [];
            for (let c = 0; c < numCols; c++) {
                rowCells.push(`val_${v.format}_${r}_${c}`);
            }
            lines.push(rowCells.join(','));
        }

        const [res, err] = await importFromCsv(lines.join('\n'));
        if (err) throw err;
        if (res.format !== v.format) throw new Error(`Format detected incorrectly: ${res.format} !== ${v.format}`);
        if (res.entries.length !== 5) {
            throw new Error(`Expected 5 entries for ${v.format}, got ${res.entries.length} (skipped: ${res.skipped.length})`);
        }
    }
}
