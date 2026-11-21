/**
 * Universal Platform Worker Adapter.
 *
 * Provides environment-agnostic creation and lifecycle management of worker instances
 * across modern browser Web Workers (ES module) and Node.js worker_threads.
 */

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Returns the detected hardware concurrency count (CPU cores).
 *
 * @returns {Promise<number>}
 */
export async function getHardwareConcurrency() {
    if (isNode) {
        try {
            const os = await import('node:os');
            if (typeof os.availableParallelism === 'function') {
                return os.availableParallelism();
            }
            if (Array.isArray(os.cpus())) {
                return os.cpus().length;
            }
        } catch {
            return 1;
        }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number') {
        return navigator.hardwareConcurrency || 1;
    }

    return 1;
}

/**
 * Checks if the current execution environment supports spawning workers.
 *
 * @returns {boolean}
 */
export function isWorkerSupported() {
    if (isNode) return true;
    return typeof globalThis.Worker !== 'undefined';
}

/**
 * Spawns an environment-appropriate worker instance.
 *
 * @param {string|URL} scriptUrl
 * @returns {Promise<Object>} Normalized worker handle
 */
export async function createPlatformWorker(scriptUrl) {
    if (isNode) {
        const { Worker } = await import('node:worker_threads');
        const worker = new Worker(scriptUrl);

        return {
            postMessage: (msg, transfer) => {
                if (transfer && transfer.length > 0) {
                    worker.postMessage(msg, transfer);
                } else {
                    worker.postMessage(msg);
                }
            },
            onMessage: (handler) => {
                worker.on('message', handler);
            },
            onError: (handler) => {
                worker.on('error', handler);
            },
            terminate: async () => {
                await worker.terminate();
            }
        };
    }

    if (typeof globalThis.Worker !== 'undefined') {
        const worker = new globalThis.Worker(scriptUrl, { type: 'module' });

        return {
            postMessage: (msg, transfer) => {
                if (transfer && transfer.length > 0) {
                    worker.postMessage(msg, transfer);
                } else {
                    worker.postMessage(msg);
                }
            },
            onMessage: (handler) => {
                worker.addEventListener('message', (event) => handler(event.data));
            },
            onError: (handler) => {
                worker.addEventListener('error', handler);
            },
            terminate: async () => {
                worker.terminate();
            }
        };
    }

    throw new Error('Platform does not support Worker execution');
}
