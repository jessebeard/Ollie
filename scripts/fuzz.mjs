/**
 * Long-run fuzz driver.
 *
 *   node scripts/fuzz.mjs [--seed=N] [--scale=M] [--only=cli,crypto]
 *
 * Default seed is random (printed for replay); CI pins a fixed seed and
 * scale 1 as a smoke pass. Any failure exits non-zero with the offending
 * suite named and the seed echoed for reproduction.
 */
import { FUZZ_SUITES, getSuiteNames } from '../test/fuzz/suites.mjs';
import { setSeed } from '../test/utils/pbt.js';

function arg(name, fallback) {
    const flag = process.argv.find(a => a.startsWith(`--${name}=`));
    return flag !== undefined ? flag.split('=').slice(1).join('=') : fallback;
}

const seedArg = arg('seed');
const scale = Math.max(1, parseInt(arg('scale', '10'), 10) || 10);
const only = arg('only', null);

const seed = seedArg !== undefined && !Number.isNaN(Number(seedArg))
    ? Number(seedArg) >>> 0
    : ((Date.now() ^ (process.pid << 16)) >>> 0);
setSeed(seed);

const requested = only ? only.split(',').filter(s => getSuiteNames().includes(s)) : getSuiteNames();
if (requested.length === 0) {
    console.error(`[fuzz] no suites matched --only='${only}'. Available: ${getSuiteNames().join(', ')}`);
    process.exit(2);
}

console.log(`[fuzz] seed=${seed} scale=${scale} suites=[${requested.join(', ')}]`);
console.log('[fuzz] replay with: node scripts/fuzz.mjs '
    + `--seed=${seed} --scale=${scale}${only ? ` --only=${only}` : ''}`);

let failed = false;
for (const name of requested) {
    const { description, run } = FUZZ_SUITES[name];
    const started = Date.now();
    try {
        await run(scale);
        console.log(`[fuzz] PASS ${name.padEnd(12)} (${Date.now() - started}ms) - ${description}`);
    } catch (e) {
        failed = true;
        console.error(`[fuzz] FAIL ${name} (${Date.now() - started}ms) - ${e.message}`);
        console.error('[fuzz] counterexample details above; reproduce with the seed shown.');
    }
}

process.exit(failed ? 1 : 0);
