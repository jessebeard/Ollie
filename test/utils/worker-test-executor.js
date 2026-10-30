import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { setupMockEnvironment, resetMockEnvironment } from './mock-env.js';
import { setSeed } from './pbt.js';
import { getStats, resetStats, executeTests, getTestResults } from './test-runner.js';

// Initialize pristine DOM environment for this worker isolate
setupMockEnvironment();

if (parentPort) {
    parentPort.on('message', async (task) => {
        if (!task) return;

        if (task.type === 'shutdown') {
            process.exit(0);
        }

        if (task.type === 'run_file') {
            const { file, fileIndex, pbtBaseSeed, verbose } = task;
            const startTime = Date.now();

            // Intercept console.log/info to prevent parallel interleaving in worker stdout
            const origLog = console.log;
            const origInfo = console.info;
            if (!verbose) {
                console.log = () => { };
                console.info = () => { };
            }

            try {
                // Reset DOM mocks and test registry for each file
                resetMockEnvironment();
                resetStats();

                // Derive deterministic per-file PBT seed (Knuth multiplicative hash)
                const fileSeed = ((pbtBaseSeed ^ (fileIndex * 2654435761)) >>> 0);
                setSeed(fileSeed);

                // Dynamically import test suite file
                const fullPath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
                const fileUrl = pathToFileURL(fullPath).href;
                await import(fileUrl);

                // Execute all registered suites in this file
                await executeTests();

                const durationMs = Date.now() - startTime;
                const stats = getStats();
                const failures = getTestResults()
                    .filter(r => r.status === 'fail')
                    .map(f => ({
                        suite: f.suite,
                        test: f.test,
                        error: f.error
                    }));

                if (!verbose) {
                    console.log = origLog;
                    console.info = origInfo;
                }

                parentPort.postMessage({
                    type: 'result',
                    file,
                    fileIndex,
                    stats,
                    failures,
                    durationMs,
                    error: null
                });
            } catch (err) {
                if (!verbose) {
                    console.log = origLog;
                    console.info = origInfo;
                }

                const durationMs = Date.now() - startTime;
                parentPort.postMessage({
                    type: 'result',
                    file,
                    fileIndex,
                    stats: { total: 1, passed: 0, failed: 1 },
                    failures: [{
                        suite: file,
                        test: 'Execution/Import Failure',
                        error: err.stack || err.message
                    }],
                    durationMs,
                    error: err.message
                });
            }
        }
    });

    // Notify parent thread that worker is ready to receive tasks
    parentPort.postMessage({ type: 'ready' });
}
