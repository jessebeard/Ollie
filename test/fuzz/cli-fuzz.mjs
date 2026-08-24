import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { parseArgs, cliSave, cliLoad, cliVerify } from '../../scripts/cli.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * CLI fuzz slice: argument-parsing never throws over arbitrary token soup,
 * and every entry point reports failures as typed error tuples.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runCliFuzz(scale = 1) {
    // -- parseArgs never throws and honors flag/value ambiguity rules --
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollie-cli-fuzz-'));
    // -- parseArgs never throws and honors flag/value ambiguity rules --
    const argvArb = {
        generate: () => {
            const len = Math.floor(Math.random() * 12);
            const out = [];
            for (let i = 0; i < len; i++) {
                const roll = Math.random();
                if (roll < 0.4) out.push('--' + 'flag' + Math.floor(Math.random() * 5));
                else if (roll < 0.7) out.push('value' + Math.floor(Math.random() * 5));
                else if (roll < 0.85) out.push('');
                else out.push('--');
            }
            return out;
        },
        shrink: (v) => (v.length > 1 ? [v.slice(0, Math.floor(v.length / 2))] : [[]])
    };

    await assertProperty(
        [argvArb],
        (argv) => {
            const parsed = parseArgs(argv);
            if (!parsed || typeof parsed !== 'object') throw new Error('parseArgs returned non-object');
            // A "--" token is a flag boundary: nothing after it may swallow it as a value.
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof key !== 'string' || key.length === 0) throw new Error('empty flag name');
                if (value === '--') throw new Error('double-dash leaked as a value');
            }
        },
        40 * scale
    );

    // -- entry points fail with {error} reports on hostile inputs --
    const badEnvelopes = [
        '',                          // empty file
        'not json at all',           // unparseable
        '{"format":"wrong"}',        // wrong format identity
        JSON.stringify({ format: 'ollie-export', version: 99, kdf: {} }) // bad version
    ];
    for (let i = 0; i < badEnvelopes.length; i++) {
        const p = path.join(workDir, `bad-${i}.json`);
        fs.writeFileSync(p, badEnvelopes[i]);
        const report = await cliLoad({ imagesDir: workDir, password: 'x', outExport: p });
        if (!(report.error instanceof Error)) throw new Error(`malformed envelope #${i} was accepted`);
    }

    {
        const report = await cliSave({
            fromExport: path.join(workDir, 'does-not-exist.json'),
            imagesDir: workDir,
            outDir: workDir,
            password: 'x'
        });
        if (!(report.error instanceof Error)) throw new Error('missing envelope accepted');
    }

    {
        const report = await cliVerify({
            imagesDir: path.join(workDir, 'no-such-dir'),
            password: 'x'
        });
        if (!(report.error instanceof Error)) throw new Error('missing images dir accepted');
    }

    fs.rmSync(workDir, { recursive: true, force: true });
}
