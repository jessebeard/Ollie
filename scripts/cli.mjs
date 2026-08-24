/**
 * Ollie CLI - Headless vault operations over steganographic carriers.
 *
 * Commands:
 *   node scripts/cli.mjs save   --fromExport seed.json --imagesDir dir --outDir dir --password pw
 *   node scripts/cli.mjs load   --imagesDir dir --password pw [--outExport out.json]
 *   node scripts/cli.mjs verify --imagesDir dir --password pw
 */
import fs from 'fs';
import path from 'path';
import { PasswordVault } from '../src/structures/vault/immutable-vault.js';

function fileFromBytes(bytes, name) {
    return {
        name,
        size: bytes.length,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteLength)
    };
}

async function readCarrierFiles(imagesDir) {
    const names = fs.readdirSync(imagesDir).filter(f => /\.(jpe?g)$/i.test(f));
    if (names.length === 0) {
        return [null, new Error(`No JPEG carriers found in ${imagesDir}`)];
    }
    const files = [];
    for (const name of names) {
        const bytes = fs.readFileSync(path.join(imagesDir, name));
        files.push(fileFromBytes(bytes, name));
    }
    return [files, null];
}

function describeVault(vault) {
    const savedDate = vault.metadata.modified
        ? new Date(vault.metadata.modified).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
        : 'unknown';
    return `Rev ${vault.metadata.revision} · ${savedDate} · ${vault.entries.length} entries`;
}

/**
 * Embeds a vault from an encrypted export envelope into carrier images.
 */
export async function cliSave({ fromExport, imagesDir, outDir, password, threshold }) {
    try {
        const envelope = fs.readFileSync(fromExport, 'utf8');
        const [vault, importErr] = await PasswordVault.importEncrypted(envelope, password);
        if (importErr) return { error: importErr };

        const [files, filesErr] = await readCarrierFiles(imagesDir);
        if (filesErr) return { error: filesErr };

        const saveOptions = threshold !== undefined ? { threshold } : {};
        const [results, saveErr] = await vault.save(files, password, null, saveOptions);
        if (saveErr) return { error: saveErr };

        fs.mkdirSync(outDir, { recursive: true });
        for (const result of results) {
            fs.writeFileSync(path.join(outDir, result.name), result.data);
        }

        const summary = `${describeVault(vault)} — written to ${results.length} carrier(s) in ${outDir}`;
        return { error: null, revision: vault.metadata.revision, entries: vault.entries.length, summary };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}

/**
 * Decrypts carriers back into a portable encrypted export envelope.
 */
export async function cliLoad({ imagesDir, password, outExport }) {
    try {
        const [files, filesErr] = await readCarrierFiles(imagesDir);
        if (filesErr) return { error: filesErr };

        const [vault, loadErr] = await PasswordVault.load(files, password);
        if (loadErr) return { error: loadErr };

        const [json, exportErr] = await vault.exportEncrypted(password);
        if (exportErr) return { error: exportErr };

        let outputPath = outExport;
        if (!outputPath) {
            outputPath = path.join(process.cwd(), `ollie-vault-rev${vault.metadata.revision}.json`);
        }
        fs.writeFileSync(outputPath, json);

        const summary = `${describeVault(vault)} — envelope written to ${outputPath}`;
        return { error: null, revision: vault.metadata.revision, entries: vault.entries.length, summary };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}

/**
 * Generates current TOTP codes for all entries that have a totp field.
 */
export async function cliTotp({ imagesDir, password }) {
    try {
        const [files, filesErr] = await readCarrierFiles(imagesDir);
        if (filesErr) return { error: filesErr };

        const [vault, loadErr] = await PasswordVault.load(files, password);
        if (loadErr) return { error: loadErr };

        const [sessionKey] = await vault._getSessionKey();
        if (!sessionKey) return { error: new Error('Cannot derive session key') };

        const codes = [];
        for (const entry of vault.entries) {
            const [plain, decErr] = await entry.decrypt(sessionKey);
            if (decErr || !plain.totp) continue;
            const { parseOtpauthUri } = await import('../src/information-theory/cryptography/totp.js');
            const [params] = parseOtpauthUri(plain.totp);
            if (!params) continue;
            const secretBytes = new TextEncoder().encode(params.secret);
            const { totp: genTotp } = await import('../src/information-theory/cryptography/totp.js');
            const [code] = await genTotp(secretBytes, {
                algorithm: params.algorithm, digits: params.digits, period: params.period
            });
            if (!code) continue;
            codes.push({ label: params.label || plain.title || entry.id, code });
        }

        if (codes.length === 0) return { error: new Error('No TOTP-enabled entries found.') };
        return { error: null, codes };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}

/**
 * Non-destructive integrity and identity check against carriers.
 */
export async function cliVerify({ imagesDir, password }) {
    try {
        const [files, filesErr] = await readCarrierFiles(imagesDir);
        if (filesErr) return { error: filesErr };

        const [vault, loadErr] = await PasswordVault.load(files, password);
        if (loadErr) return { error: loadErr };

        const summary = `OK — ${describeVault(vault)}`;
        return { error: null, revision: vault.metadata.revision, entries: vault.entries.length, summary };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}

/**
 * Parses CLI flag pairs into an options object. Flags without a following
 * value become `true`; a token starting with `--` is always treated as the
 * next flag, never as a value.
 *
 * @param {string[]} argv
 * @returns {Object<string, string|boolean>}
 */
/**
 * Parses CLI flag pairs into an options object. Flags without a following
 * value become `true`; a token starting with `--` is always treated as the
 * next flag, never as a value. A bare `--` ends option parsing.
 *
 * @param {string[]} argv
 * @returns {Object} Parsed flag map
 */
export function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            if (key === '') break;   // bare "--" ends option parsing
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                args[key] = next;
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return args;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1] && path.basename(process.argv[1]) === 'cli.mjs') {
    const [, , command, ...rest] = process.argv;
    const args = parseArgs(rest);

    let report;
    switch (command) {
        case 'save':
            report = await cliSave({
                fromExport: args.fromExport,
                imagesDir: args.imagesDir,
                outDir: args.outDir,
                password: args.password,
                threshold: args.threshold !== undefined ? Number(args.threshold) : undefined
            });
            break;
        case 'load':
            report = await cliLoad({
                imagesDir: args.imagesDir,
                password: args.password,
                outExport: args.outExport
            });
            break;
        case 'verify':
            report = await cliVerify({
                imagesDir: args.imagesDir,
                password: args.password
            });
            break;
        case 'totp':
            report = await cliTotp({
                imagesDir: args.imagesDir,
                password: args.password
            });
            if (!report.error) {
                for (const c of report.codes) {
                    console.log(`${c.label}: ${c.code}`);
                }
            }
            break;
        default:
            console.error('Usage: node scripts/cli.mjs <save|load|verify|totp> --help for flags');
            process.exit(1);
    }

    if (report.error) {
        console.error('Error:', report.error.message);
        process.exit(1);
    }
    console.log(report.summary);
}
