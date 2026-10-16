import { describe, it, expect } from '../utils/test-runner.js';

if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    describe('Ollie CLI', () => {
        it('Skipped in Browser', () => { expect(true).toBe(true); });
    });
} else {
    const fs = (await import('fs')).default;
    const os = (await import('os')).default;
    const path = (await import('path')).default;
    const { cliSave, cliLoad, cliVerify, cliImportCsv, cliTotp, parseArgs } = await import('../../scripts/cli.mjs');
    const { PasswordVault } = await import('../../src/structures/vault/immutable-vault.js');
    const { JpegEncoder } = await import('../../src/codec/encoder.js');

    const PASSWORD = 'cli-roundtrip-pw';

    function makeMockFile(bytes, name) {
        return {
            name,
            size: bytes.length,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        };
    }

    async function makeCarrierFile(dir, name) {
        const width = 800;
        const height = 600;
        const data = new Uint8ClampedArray(width * height * 4);
        let seed = 1234567;
        for (let i = 0; i < data.length; i += 4) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            data[i] = (seed >>> 24) & 0xFF;
            data[i + 1] = (seed >>> 16) & 0xFF;
            data[i + 2] = (seed >>> 8) & 0xFF;
            data[i + 3] = 255;
        }
        const bytes = await new JpegEncoder(90).encode({ width, height, data });
        const filePath = path.join(dir, name);
        fs.writeFileSync(filePath, bytes);
        return filePath;
    }

    async function makeSeedEnvelope(filePath) {
        let vault = new PasswordVault([], null, true, PASSWORD);
        [vault] = await vault.addEntry({ title: 'site-a', username: 'u-a', password: 'secret-a' });
        [vault] = await vault.addEntry({ title: 'site-b', username: 'u-b', password: 'secret-b' });
        const [json, err] = await vault.exportEncrypted(PASSWORD);
        if (err) throw err;
        fs.writeFileSync(filePath, json);
        return vault;
    }

    describe('Ollie CLI', () => {

        it('save/load/verify forms a complete headless loop with revision reporting', async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollie-cli-'));
            const carriersDir = path.join(workDir, 'carriers');
            const outDir = path.join(workDir, 'out');
            fs.mkdirSync(carriersDir);
            fs.mkdirSync(outDir);

            const envelopePath = path.join(workDir, 'seed-export.json');
            const sourceVault = await makeSeedEnvelope(envelopePath);
            await makeCarrierFile(carriersDir, 'carrier-1.jpg');

            // SAVE: embed the seeded vault into carriers
            const saveReport = await cliSave({
                fromExport: envelopePath,
                imagesDir: carriersDir,
                outDir,
                password: PASSWORD
            });
            expect(saveReport.error).toEqual(null);
            expect(saveReport.revision).toBe(sourceVault.metadata.revision);
            expect(/Rev \d+/.test(saveReport.summary)).toBe(true);
            expect(fs.readdirSync(outDir).length).toBe(1);

            // VERIFY: non-destructive integrity + identity check
            const verifyReport = await cliVerify({
                imagesDir: outDir,
                password: PASSWORD
            });
            expect(verifyReport.error).toEqual(null);
            expect(verifyReport.entries).toBe(2);
            expect(verifyReport.revision).toBe(sourceVault.metadata.revision);

            // LOAD: decrypt carriers back into a portable encrypted envelope
            const reloadedEnvelopePath = path.join(workDir, 'reloaded-export.json');
            const loadReport = await cliLoad({
                imagesDir: outDir,
                password: PASSWORD,
                outExport: reloadedEnvelopePath
            });
            expect(loadReport.error).toEqual(null);
            expect(fs.existsSync(reloadedEnvelopePath)).toBe(true);

            const [restored, restoreErr] = await PasswordVault.importEncrypted(
                fs.readFileSync(reloadedEnvelopePath, 'utf8'), PASSWORD
            );
            expect(restoreErr).toEqual(null);
            expect(restored.metadata.revision).toBe(sourceVault.metadata.revision);

            const [plaintext] = await restored.getPlaintextJSON();
            const restoredData = JSON.parse(plaintext);
            expect(restoredData.entries[0].password).toBe('secret-a');

            fs.rmSync(workDir, { recursive: true, force: true });
        });

        it('--threshold saves erasure-coded carriers and tolerates losing one', async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollie-cli-ec-'));
            const carriersDir = path.join(workDir, 'carriers');
            const outDir = path.join(workDir, 'out');
            fs.mkdirSync(carriersDir);
            fs.mkdirSync(outDir);

            const envelopePath = path.join(workDir, 'seed-export.json');
            await makeSeedEnvelope(envelopePath);
            for (let i = 1; i <= 3; i++) {
                await makeCarrierFile(carriersDir, `carrier-${i}.jpg`);
            }

            const saveReport = await cliSave({
                fromExport: envelopePath,
                imagesDir: carriersDir,
                outDir,
                password: PASSWORD,
                threshold: 2
            });
            expect(saveReport.error).toEqual(null);

            const written = fs.readdirSync(outDir);
            if (written.length !== 3) throw new Error(`expected 3 coded carriers, got ${written.length}`);

            // Loss tolerance: delete one carrier, the remaining two still load.
            const keptDir = path.join(workDir, 'kept');
            fs.mkdirSync(keptDir);
            written.slice(1).forEach(f => fs.copyFileSync(path.join(outDir, f), path.join(keptDir, f)));

            const reloadedPath = path.join(workDir, 'subset-export.json');
            const loadReport = await cliLoad({
                imagesDir: keptDir,
                password: PASSWORD,
                outExport: reloadedPath
            });
            expect(loadReport.error).toEqual(null);
            if (!fs.existsSync(reloadedPath)) throw new Error('subset load produced no export');

            const verifyReport = await cliVerify({ imagesDir: keptDir, password: PASSWORD });
            expect(verifyReport.error).toEqual(null);
        });

        it('verify reports a typed error instead of throwing on wrong password', async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollie-cli-'));
            const outDir = path.join(workDir, 'out');
            fs.mkdirSync(outDir);

            const envelopePath = path.join(workDir, 'seed.json');
            await makeSeedEnvelope(envelopePath);
            const carriersDir = path.join(workDir, 'carriers');
            fs.mkdirSync(carriersDir);
            await makeCarrierFile(carriersDir, 'c.jpg');

            await cliSave({ fromExport: envelopePath, imagesDir: carriersDir, outDir, password: PASSWORD });

            const report = await cliVerify({ imagesDir: outDir, password: 'wrong' });
            expect(report.error instanceof Error).toBe(true);

            fs.rmSync(workDir, { recursive: true, force: true });
        });

        it('import-csv converts vendor CSV into an encrypted envelope that save --fromExport accepts', async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollie-cli-import-'));
            const csvPath = path.join(workDir, 'logins.csv');
            const outEnvelope = path.join(workDir, 'imported.json');

            const firefoxCsv = [
                '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"',
                '"https://example.com/","u@x.com","pw1","realm","","g1","1700000000000","",""',
                '"https://test.org/","u2","pw2","","","g2","","",""'
            ].join('\r\n');
            fs.writeFileSync(csvPath, firefoxCsv);

            const report = await cliImportCsv({
                csv: csvPath,
                password: PASSWORD,
                outExport: outEnvelope
            });
            expect(report.error).toEqual(null);
            expect(report.entries).toBe(2);
            if (!fs.existsSync(outEnvelope)) throw new Error('envelope not written');

            // Composition contract: output must round-trip through importEncrypted.
            const [restored, restoreErr] = await PasswordVault.importEncrypted(
                fs.readFileSync(outEnvelope, 'utf8'), PASSWORD
            );
            expect(restoreErr).toEqual(null);
            expect(restored.entries.length).toBe(2);

            const [plaintext] = await restored.getPlaintextJSON();
            const data = JSON.parse(plaintext);
            expect(data.entries[0].title).toBe('example.com');
            expect(data.entries[0].password).toBe('pw1');

            fs.rmSync(workDir, { recursive: true, force: true });
        });

        it('import-csv reports unsupported headers as a typed error', async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollie-cli-import-bad-'));
            const csvPath = path.join(workDir, 'weird.csv');
            fs.writeFileSync(csvPath, 'foo,bar\n1,2\n');

            const report = await cliImportCsv({
                csv: csvPath,
                password: PASSWORD,
                outExport: path.join(workDir, 'out.json')
            });
            expect(report.error instanceof Error).toBe(true);
            expect(report.error.message).toContain('unsupported header layout');

            fs.rmSync(workDir, { recursive: true, force: true });
        });

        it('parseArgs maps the import-csv flag surface', () => {
            const parsed = parseArgs(['--csv', 'a.csv', '--format', 'lastpass', '--outExport', 'o.json']);
            expect(parsed.csv).toBe('a.csv');
            expect(parsed.format).toBe('lastpass');
            expect(parsed.outExport).toBe('o.json');
        });

        it('totp generates live codes for carrier-backed entries with otpauth URIs', async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollie-cli-totp-'));
            const carriersDir = path.join(workDir, 'carriers');
            const outDir = path.join(workDir, 'out');
            fs.mkdirSync(carriersDir);
            fs.mkdirSync(outDir);

            // Seed a vault whose entry carries an RFC-vector otpauth URI.
            let vault = new PasswordVault([], null, true, PASSWORD);
            [vault] = await vault.addEntry({
                title: 'TOTP Site',
                password: 'pw',
                totp: 'otpauth://totp/RFC:vector?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8'
            });
            const [json, exportErr] = await vault.exportEncrypted(PASSWORD);
            if (exportErr) throw exportErr;
            const envelopePath = path.join(workDir, 'seed.json');
            fs.writeFileSync(envelopePath, json);

            await makeCarrierFile(carriersDir, 'c.jpg');
            const saveReport = await cliSave({ fromExport: envelopePath, imagesDir: carriersDir, outDir, password: PASSWORD });
            expect(saveReport.error).toEqual(null);

            // Deterministic: RFC 6238 Annex B SHA-1 vector at T=59.
            const report = await cliTotp({ imagesDir: outDir, password: PASSWORD, now: 59 });
            expect(report.error).toEqual(null);
            if (!report.codes || report.codes.length !== 1) throw new Error(`expected 1 code, got ${report.codes ? report.codes.length : 0}`);
            if (report.codes[0].label !== 'RFC:vector') throw new Error(`label mismatch: ${report.codes[0].label}`);
            if (report.codes[0].code !== '94287082') {
                throw new Error(`got ${report.codes[0].code}, expected 94287082 (secret must be Base32-decoded, not UTF-8-encoded)`);
            }

            fs.rmSync(workDir, { recursive: true, force: true });
        });
    });
}
