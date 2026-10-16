/**
 * Long-run fuzz driver.
 *
 *   node scripts/fuzz.mjs [--seed=N] [--scale=M|smoke|light|medium|heavy] [--only=tag_or_suite,...] [--tags]
 *
 * Default seed is random (printed for replay); CI pins a fixed seed and
 * scale=smoke (1) as a fast pass. Any failure exits non-zero with the offending
 * suite named and the seed echoed for reproduction.
 */
import { FUZZ_SUITES, getSuiteNames, getSuitesByTag, getAllTags } from '../test/fuzz/suites.mjs';
import { setSeed } from '../test/utils/pbt.js';

function arg(name, fallback) {
    const idx = process.argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
    if (idx === -1) return fallback;
    const val = process.argv[idx];
    if (val.startsWith(`--${name}=`)) {
        return val.slice(name.length + 3);
    }
    if (idx + 1 < process.argv.length && !process.argv[idx + 1].startsWith('--')) {
        return process.argv[idx + 1];
    }
    return fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

if (hasFlag('tags')) {
    console.log('Available fuzz tags:');
    for (const tag of getAllTags()) {
        const suites = getSuitesByTag(tag);
        console.log(`  ${tag.padEnd(14)} -> [${suites.join(', ')}]`);
    }
    process.exit(0);
}

const SCALE_MAP = {
    smoke: 1,
    light: 3,
    medium: 10,
    heavy: 25
};

function parseScale(scaleStr) {
    if (!scaleStr) return 10;
    const lower = scaleStr.toLowerCase();
    if (SCALE_MAP[lower] !== undefined) return SCALE_MAP[lower];
    const num = parseInt(scaleStr, 10);
    return !Number.isNaN(num) && num > 0 ? num : 10;
}

const seedArg = arg('seed');
const scaleArg = arg('scale', null);
const cliScale = scaleArg ? parseScale(scaleArg) : null;
const only = arg('only', null);

const seed = seedArg !== undefined && !Number.isNaN(Number(seedArg))
    ? Number(seedArg) >>> 0
    : ((Date.now() ^ (process.pid << 16)) >>> 0);
setSeed(seed);

function resolveRequestedSuites(onlyArg) {
    if (!onlyArg) return getSuiteNames();
    const tokens = onlyArg.split(',').map(t => t.trim()).filter(Boolean);
    const matched = new Set();
    const allSuites = getSuiteNames();

    for (const token of tokens) {
        if (allSuites.includes(token)) {
            matched.add(token);
        }
        const byTag = getSuitesByTag(token);
        if (byTag.length > 0) {
            byTag.forEach(s => matched.add(s));
        }
    }
    return Array.from(matched);
}

const requested = resolveRequestedSuites(only);
if (requested.length === 0) {
    console.error(`[fuzz] no suites matched --only='${only}'. Available suites: ${getSuiteNames().join(', ')}`);
    console.error(`[fuzz] available tags: ${getAllTags().join(', ')}`);
    process.exit(2);
}

console.log(`[fuzz] seed=${seed} scale=${cliScale ?? 'default'} suites=[${requested.join(', ')}]`);
console.log('[fuzz] replay with: node scripts/fuzz.mjs '
    + `--seed=${seed}${cliScale !== null ? ` --scale=${cliScale}` : ''}${only ? ` --only=${only}` : ''}`);

let failed = false;
for (const name of requested) {
    const { description, run, defaultScale } = FUZZ_SUITES[name];
    const effectiveScale = cliScale !== null ? cliScale : (defaultScale || 10);
    const started = Date.now();
    try {
        await run(effectiveScale);
        console.log(`[fuzz] PASS ${name.padEnd(12)} (${Date.now() - started}ms) - ${description}`);
    } catch (e) {
        failed = true;
        console.error(`[fuzz] FAIL ${name} (${Date.now() - started}ms) - ${e.message}`);
        console.error('[fuzz] counterexample details above; reproduce with the seed shown.');
    }
}

process.exit(failed ? 1 : 0);
