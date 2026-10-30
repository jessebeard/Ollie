import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEST_FILES } from './utils/test-files.js';
import { setupMockEnvironment } from './utils/mock-env.js';
import { runParallelTests } from './runner-parallel.js';

async function runSequentialTests(targetFiles) {
    console.log('\x1b[1m=== Ollie Test Runner (Sequential Mode) ===\x1b[0m\n');
    setupMockEnvironment();

    try {
        const { setSeed, getSeed } = await import('./utils/pbt.js');
        const pbtSeed = process.env.PBT_SEED !== undefined && process.env.PBT_SEED !== ''
            ? (Number(process.env.PBT_SEED) >>> 0)
            : ((Date.now() ^ (process.pid << 16)) >>> 0);
        setSeed(pbtSeed);
        console.log(`[PBT] seed=${getSeed()} (replay with PBT_SEED=${getSeed()} node test/runner.js --sequential)\n`);

        const { getStats, resetStats, executeTests, getTestResults } = await import('./utils/test-runner.js');
        resetStats();

        for (const file of targetFiles) {
            const fullPath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
            await import(pathToFileURL(fullPath).href);
        }

        await executeTests();
        const stats = getStats();

        console.log(`\n\x1b[1mTest Summary:\x1b[0m`);
        console.log(`  Total:  ${stats.total}`);
        console.log(`  \x1b[32mPassed: ${stats.passed}\x1b[0m`);
        console.log(`  \x1b[31mFailed: ${stats.failed}\x1b[0m`);

        if (stats.failed > 0) {
            console.log(`\n\x1b[31mFailed Test Details:\x1b[0m`);
            const failed = getTestResults().filter(r => r.status === 'fail');
            failed.forEach(f => {
                console.log(`  ✗ [${f.suite}] ${f.test}: ${f.error}`);
            });
            process.exit(1);
        } else {
            process.exit(0);
        }
    } catch (error) {
        console.error('\x1b[31mError running tests sequentially:\x1b[0m', error);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const isSequential = args.includes('--sequential') || args.includes('--single-thread');
    const workerArg = args.find(a => a.startsWith('--workers='));
    const workers = workerArg ? parseInt(workerArg.split('=')[1], 10) : undefined;
    const verbose = args.includes('--verbose');

    // Extract filter strings (arguments not prefixed with --)
    const filterArgs = args.filter(a => !a.startsWith('--'));
    let targetFiles = TEST_FILES;
    if (filterArgs.length > 0) {
        targetFiles = TEST_FILES.filter(f =>
            filterArgs.some(pattern => f.includes(pattern))
        );
        if (targetFiles.length === 0) {
            console.error(`No test files matched filter: ${filterArgs.join(', ')}`);
            process.exit(1);
        }
    }

    if (isSequential) {
        await runSequentialTests(targetFiles);
    } else {
        const [, err] = await runParallelTests({
            files: targetFiles,
            workers,
            verbose
        });
        process.exit(err ? 1 : 0);
    }
}

main();
