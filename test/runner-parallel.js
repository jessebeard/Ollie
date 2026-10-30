import { Worker } from 'node:worker_threads';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_FILES } from './utils/test-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.resolve(__dirname, './utils/worker-test-executor.js');

/**
 * FNV-1a 32-bit hash for deterministic per-file PBT seed salting
 * @param {string} str 
 * @returns {number} 32-bit unsigned integer
 */
function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/**
 * Heuristic weight to schedule heavy / long-running tests first,
 * preventing stragglers from dominating tail wall-clock latency.
 * @param {string} file 
 * @returns {number}
 */
function scoreFileWeight(file) {
    if (file.includes('threshold-vault')) return 2000;
    if (file.includes('vault-batch')) return 1900;
    if (file.includes('cli.test.js')) return 1800;
    if (file.includes('manifest-enforcement')) return 1700;
    if (file.includes('pbkdf2.test.js')) return 1600;
    if (file.includes('aes-gcm.test.js')) return 1500;
    if (file.includes('vault-spread-save')) return 1400;
    if (file.includes('transcoder.test.js')) return 1300;
    if (file.includes('immutable-vault')) return 1200;
    if (file.includes('rst-markers')) return 1150;
    if (file.includes('vault-e2e-multigen')) return 1100;
    if (file.includes('carrier-manifest.test.js')) return 1050;
    if (file.includes('extension-threat-audit')) return 1000;
    if (file.includes('pbkdf2-benchmark')) return 950;
    if (file.includes('juniward')) return 900;
    if (file.includes('kdf-fuzz')) return 850;
    if (file.includes('steganography.pbt')) return 800;
    if (file.includes('crypto.pbt')) return 750;
    if (file.includes('vault-e2e')) return 700;
    if (file.includes('stego-engine')) return 600;
    if (file.includes('.pbt.js')) return 500;
    if (file.includes('/fuzz/')) return 400;
    if (file.includes('/integration/')) return 300;
    return 100;
}

/**
 * Runs test files across worker threads in parallel.
 * @param {Object} [options]
 * @param {string[]} [options.files] - Subset of files to run
 * @param {number} [options.workers] - Worker thread count
 * @param {number} [options.seed] - PBT base seed
 * @param {boolean} [options.verbose=false] - Verbose worker logging
 * @returns {Promise<[{ total: number, passed: number, failed: number, durationMs: number }, Error|null]>}
 */
export async function runParallelTests(options = {}) {
    const startTime = Date.now();

    const pbtBaseSeed = options.seed !== undefined
        ? (Number(options.seed) >>> 0)
        : (process.env.PBT_SEED !== undefined && process.env.PBT_SEED !== ''
            ? (Number(process.env.PBT_SEED) >>> 0)
            : ((Date.now() ^ (process.pid << 16)) >>> 0));

    const totalCpus = typeof os.availableParallelism === 'function'
        ? os.availableParallelism()
        : os.cpus().length;

    const workerCount = options.workers !== undefined
        ? Math.max(1, Number(options.workers))
        : (process.env.WORKERS !== undefined
            ? Math.max(1, Number(process.env.WORKERS))
            : Math.max(1, totalCpus - 1));

    const targetFiles = options.files && options.files.length > 0
        ? [...options.files]
        : [...TEST_FILES];

    // Sort files by descending execution weight to eliminate tail stragglers
    const workQueue = [...targetFiles].sort((a, b) => scoreFileWeight(b) - scoreFileWeight(a));
    const totalFiles = workQueue.length;

    console.log('\x1b[1m=== Ollie Multithreaded Test Runner ===\x1b[0m');
    console.log(`[Config] Cores: ${totalCpus} | Workers: ${workerCount} | Test Files: ${totalFiles}`);
    console.log(`[PBT] seed=${pbtBaseSeed} (replay with PBT_SEED=${pbtBaseSeed})\n`);

    const summary = {
        total: 0,
        passed: 0,
        failed: 0,
        durationMs: 0
    };
    const allFailures = [];
    let completedCount = 0;

    return new Promise((resolve) => {
        let activeWorkers = 0;
        const workers = [];

        function dispatchNext(worker) {
            if (workQueue.length === 0) {
                worker.postMessage({ type: 'shutdown' });
                return;
            }

            const nextFile = workQueue.shift();
            const fileSeed = ((pbtBaseSeed ^ (hashString(nextFile) * 2654435761)) >>> 0);

            worker.postMessage({
                type: 'run_file',
                file: nextFile,
                fileIndex: totalFiles - workQueue.length,
                pbtBaseSeed: fileSeed,
                verbose: options.verbose || false
            });
        }

        function checkCompletion() {
            if (activeWorkers === 0 && workQueue.length === 0) {
                summary.durationMs = Date.now() - startTime;

                console.log(`\n\x1b[1mTest Summary:\x1b[0m`);
                console.log(`  Total:    ${summary.total}`);
                console.log(`  \x1b[32mPassed:   ${summary.passed}\x1b[0m`);
                if (summary.failed > 0) {
                    console.log(`  \x1b[31mFailed:   ${summary.failed}\x1b[0m`);
                } else {
                    console.log(`  Failed:   0`);
                }
                const wallSec = (summary.durationMs / 1000).toFixed(2);
                console.log(`  Duration: ${wallSec}s (Parallel across ${workerCount} workers)\n`);

                if (allFailures.length > 0) {
                    console.log(`\x1b[31mFailed Test Details (${allFailures.length} failure${allFailures.length > 1 ? 's' : ''}):\x1b[0m`);
                    allFailures.forEach(f => {
                        console.log(`  \x1b[31m✗\x1b[0m [${f.file}] ${f.suite} -> ${f.test}`);
                        console.log(`    \x1b[90m${f.error}\x1b[0m`);
                    });
                    resolve([summary, new Error(`${summary.failed} tests failed`)]);
                } else {
                    resolve([summary, null]);
                }
            }
        }

        const effectiveWorkers = Math.min(workerCount, totalFiles);
        activeWorkers = effectiveWorkers;

        for (let i = 0; i < effectiveWorkers; i++) {
            const worker = new Worker(WORKER_SCRIPT);
            workers.push(worker);

            worker.on('message', (msg) => {
                if (msg.type === 'ready') {
                    dispatchNext(worker);
                } else if (msg.type === 'result') {
                    completedCount++;
                    summary.total += msg.stats.total;
                    summary.passed += msg.stats.passed;
                    summary.failed += msg.stats.failed;

                    const padIndex = String(completedCount).padStart(String(totalFiles).length, ' ');
                    if (msg.stats.failed === 0) {
                        console.log(`  \x1b[32m✓\x1b[0m [${padIndex}/${totalFiles}] ${msg.file} \x1b[90m(${msg.stats.passed} passed, ${msg.durationMs}ms)\x1b[0m`);
                    } else {
                        console.log(`  \x1b[31m✗\x1b[0m [${padIndex}/${totalFiles}] ${msg.file} \x1b[31m(${msg.stats.failed} failed, ${msg.durationMs}ms)\x1b[0m`);
                        if (msg.failures && msg.failures.length > 0) {
                            msg.failures.forEach(f => {
                                allFailures.push({ file: msg.file, ...f });
                            });
                        }
                    }

                    dispatchNext(worker);
                }
            });

            worker.on('error', (err) => {
                console.error(`\x1b[31mWorker thread ${i} fatal error:\x1b[0m`, err);
                summary.failed++;
                allFailures.push({
                    file: 'worker_thread_' + i,
                    suite: 'WorkerThread',
                    test: 'UncaughtException',
                    error: err.stack || err.message
                });
                activeWorkers--;
                checkCompletion();
            });

            worker.on('exit', (code) => {
                activeWorkers--;
                if (code !== 0 && code !== null) {
                    console.error(`\x1b[31mWorker thread ${i} exited with non-zero code ${code}\x1b[0m`);
                }
                checkCompletion();
            });
        }
    });
}

// Direct CLI invocation
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    const args = process.argv.slice(2);
    const workerArg = args.find(a => a.startsWith('--workers='));
    const workers = workerArg ? parseInt(workerArg.split('=')[1], 10) : undefined;
    const verbose = args.includes('--verbose');

    // Any argument that doesn't start with -- is treated as a file filter
    const filterArgs = args.filter(a => !a.startsWith('--'));
    let filteredFiles = null;
    if (filterArgs.length > 0) {
        filteredFiles = TEST_FILES.filter(f =>
            filterArgs.some(pattern => f.includes(pattern))
        );
        if (filteredFiles.length === 0) {
            console.error(`No test files matched filter: ${filterArgs.join(', ')}`);
            process.exit(1);
        }
    }

    const [, err] = await runParallelTests({
        files: filteredFiles,
        workers,
        verbose
    });

    process.exit(err ? 1 : 0);
}
