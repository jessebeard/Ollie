/**
 * Universal Plain-JavaScript Worker Pool.
 *
 * Manages parallel task execution across a pool of background workers (Web Workers
 * or Node.js worker_threads) with zero npm dependencies, automatic hardware core
 * scaling, zero-copy buffer transfer, task timeouts, and deterministic Result/Option tuples.
 */

import { getHardwareConcurrency, isWorkerSupported, createPlatformWorker } from './worker-adapter.js';
import { deserializeTuple } from './tuple-serializer.js';

export class WorkerPool {
    /**
     * @param {Object} [options={}]
     * @param {string|URL} [options.workerScript] - Path or URL to worker ES module
     * @param {number} [options.maxWorkers] - Concurrency ceiling (defaults to hardware cores - 1, min 1)
     * @param {number} [options.defaultTimeoutMs=60000] - Default task timeout in milliseconds (0 = no timeout)
     * @param {boolean} [options.enabled=true] - Enable worker threading (falls back if false)
     * @param {Function} [options.fallbackHandler] - async (action, payload) => [result, error] main-thread fallback
     */
    constructor(options = {}) {
        if (!options.workerScript && options.enabled !== false) {
            throw new Error('WorkerPool requires a workerScript URL or explicit enabled: false');
        }

        this.workerScript = options.workerScript;
        this.maxWorkers = options.maxWorkers || null;
        this.defaultTimeoutMs = options.defaultTimeoutMs !== undefined ? options.defaultTimeoutMs : 60000;
        this.enabled = options.enabled !== false;
        this.fallbackHandler = options.fallbackHandler || null;

        /** @type {Array<{ handle: Object, busy: boolean, currentTaskId: string|null }>} */
        this.workers = [];
        /** @type {Array<Object>} */
        this.taskQueue = [];
        /** @type {Map<string, { resolve: Function, timer: any, workerEntry: Object }>} */
        this.activeTasks = new Map();

        this.initialized = false;
        this.terminating = false;
        this.sequence = 0;
        this._spawningCount = 0;
    }

    /**
     * Initializes hardware concurrency and pool bounds.
     *
     * @returns {Promise<[boolean|null, Error|null]>} Result tuple
     */
    async init() {
        if (this.initialized) return [true, null];

        if (!this.enabled || !isWorkerSupported()) {
            this.initialized = true;
            return [true, null];
        }

        try {
            if (!this.maxWorkers) {
                const cores = await getHardwareConcurrency();
                // Default to n - 1 cores (min 1) to leave a dedicated thread for OS/UI event loop
                this.maxWorkers = Math.max(1, cores - 1);
            }
            this.initialized = true;
            return [true, null];
        } catch (err) {
            return [null, err instanceof Error ? err : new Error(String(err))];
        }
    }

    /**
     * Spawns a new worker up to the maxWorkers limit.
     *
     * @private
     * @returns {Promise<Object|null>}
     */
    async _spawnWorker() {
        if ((this.workers.length + this._spawningCount) >= this.maxWorkers || this.terminating) {
            return null;
        }

        this._spawningCount++;
        try {
            const handle = await createPlatformWorker(this.workerScript);
            const entry = {
                handle,
                busy: false,
                currentTaskId: null
            };

            handle.onMessage((response) => {
                this._handleWorkerMessage(entry, response);
            });

            handle.onError((err) => {
                this._handleWorkerError(entry, err);
            });

            this.workers.push(entry);
            return entry;
        } catch (err) {
            return null;
        } finally {
            this._spawningCount--;
        }
    }

    /**
     * Dispatches a task to the pool.
     *
     * @param {string} action
     * @param {any} payload
     * @param {ArrayBuffer[]} [transfer=[]] - Optional zero-copy transfer list
     * @param {Object} [options={}]
     * @param {number} [options.timeoutMs] - Task-specific timeout override
     * @returns {Promise<[any, Error|null]>} Ollie Result tuple
     */
    async dispatch(action, payload, transfer = [], options = {}) {
        if (!Array.isArray(transfer) && typeof transfer === 'object' && transfer !== null) {
            options = transfer;
            transfer = [];
        }

        if (!this.initialized) {
            const [, initErr] = await this.init();
            if (initErr) return [null, initErr];
        }

        // Direct fallback path if workers are disabled or unsupported
        if (!this.enabled || !isWorkerSupported()) {
            return this._executeFallback(action, payload);
        }

        if (this.terminating) {
            return [null, new Error('WorkerPool terminated')];
        }

        const taskId = `task_${++this.sequence}_${Date.now()}`;
        const timeoutMs = options.timeoutMs !== undefined ? options.timeoutMs : this.defaultTimeoutMs;

        return new Promise(async (resolve) => {
            const task = {
                id: taskId,
                action,
                payload,
                transfer,
                timeoutMs,
                resolve,
                timer: null,
                timedOut: false
            };

            if (timeoutMs > 0) {
                task.timer = globalThis.setTimeout(() => {
                    this._handleTaskTimeout(task);
                }, timeoutMs);
            }

            await this._scheduleTask(task);
        });
    }

    /**
     * Attempts to assign a task immediately to an idle worker, or queues it.
     *
     * @private
     * @param {Object} task
     */
    async _scheduleTask(task) {
        if (task.timedOut) return;

        // Find an idle worker
        let idleWorker = this.workers.find(w => !w.busy);

        // If no idle worker and we haven't reached maxWorkers, spawn one
        if (!idleWorker && (this.workers.length + this._spawningCount) < this.maxWorkers) {
            idleWorker = await this._spawnWorker();
        }

        if (task.timedOut) return;

        if (idleWorker) {
            this._runTaskOnWorker(idleWorker, task);
        } else {
            // Queue for next available worker
            this.taskQueue.push(task);
        }
    }

    /**
     * Executes a task on an allocated worker.
     *
     * @private
     * @param {Object} workerEntry
     * @param {Object} task
     */
    _runTaskOnWorker(workerEntry, task) {
        if (task.timedOut) return;

        workerEntry.busy = true;
        workerEntry.currentTaskId = task.id;

        this.activeTasks.set(task.id, {
            resolve: task.resolve,
            timer: task.timer,
            workerEntry
        });

        try {
            workerEntry.handle.postMessage({
                id: task.id,
                action: task.action,
                payload: task.payload
            }, task.transfer);
        } catch (postErr) {
            this._cleanupTask(task.id);
            workerEntry.busy = false;
            workerEntry.currentTaskId = null;
            task.resolve([null, postErr instanceof Error ? postErr : new Error(String(postErr))]);
            this._drainQueue();
        }
    }

    /**
     * Handles normal completion message from worker.
     *
     * @private
     * @param {Object} workerEntry
     * @param {Object} response
     */
    _handleWorkerMessage(workerEntry, response) {
        if (!response || !response.id) return;

        const record = this.activeTasks.get(response.id);
        if (!record) return;

        this._cleanupTask(response.id);

        workerEntry.busy = false;
        workerEntry.currentTaskId = null;

        const tuple = deserializeTuple(response);
        record.resolve(tuple);

        this._drainQueue();
    }

    /**
     * Handles catastrophic error or unhandled panic on a worker.
     *
     * @private
     * @param {Object} workerEntry
     * @param {any} err
     */
    async _handleWorkerError(workerEntry, err) {
        const taskId = workerEntry.currentTaskId;

        if (taskId) {
            const record = this.activeTasks.get(taskId);
            if (record) {
                this._cleanupTask(taskId);
                const normalizedErr = err instanceof Error ? err : new Error(String(err && err.message ? err.message : err));
                record.resolve([null, normalizedErr]);
            }
        }

        // Recycle crashed worker
        await this._recycleWorker(workerEntry);
        this._drainQueue();
    }

    /**
     * Handles task exceeding timeout limit either while waiting in queue or running on a worker.
     *
     * @private
     * @param {Object} task
     */
    async _handleTaskTimeout(task) {
        task.timedOut = true;

        // 1. Check if task is still in queue waiting for an idle worker
        const qIndex = this.taskQueue.findIndex(t => t.id === task.id);
        if (qIndex !== -1) {
            this.taskQueue.splice(qIndex, 1);
            task.resolve([null, new Error(`WorkerPool task timed out (timeout: ${task.timeoutMs}ms) while waiting in queue`)]);
            return;
        }

        // 2. Check if task is actively executing on a worker
        const record = this.activeTasks.get(task.id);
        if (record) {
            this._cleanupTask(task.id);
            record.resolve([null, new Error(`WorkerPool task timed out (timeout: ${task.timeoutMs}ms) exceeded execution limit`)]);

            // Terminate wedged worker and replace it
            await this._recycleWorker(record.workerEntry);
            this._drainQueue();
        }
    }

    /**
     * Terminates a worker and removes it from the pool.
     *
     * @private
     * @param {Object} workerEntry
     */
    async _recycleWorker(workerEntry) {
        const index = this.workers.indexOf(workerEntry);
        if (index !== -1) {
            this.workers.splice(index, 1);
        }

        try {
            await workerEntry.handle.terminate();
        } catch {
            // Ignore termination errors on dead workers
        }

        // If there are pending tasks in queue, spawn a replacement
        if (this.taskQueue.length > 0 && !this.terminating) {
            await this._spawnWorker();
        }
    }

    /**
     * Cancels active timer and removes task record.
     *
     * @private
     * @param {string} taskId
     */
    _cleanupTask(taskId) {
        const record = this.activeTasks.get(taskId);
        if (record && record.timer) {
            globalThis.clearTimeout(record.timer);
        }
        this.activeTasks.delete(taskId);
    }

    /**
     * Drains the next task in the queue if a worker is free.
     *
     * @private
     */
    async _drainQueue() {
        if (this.taskQueue.length === 0 || this.terminating) return;

        let idleWorker = this.workers.find(w => !w.busy);
        if (!idleWorker && (this.workers.length + this._spawningCount) < this.maxWorkers) {
            idleWorker = await this._spawnWorker();
        }

        if (idleWorker) {
            const nextTask = this.taskQueue.shift();
            if (nextTask) {
                if (nextTask.timedOut) {
                    this._drainQueue();
                } else {
                    this._runTaskOnWorker(idleWorker, nextTask);
                }
            }
        }
    }

    /**
     * Executes task via fallback handler when workers are disabled or unavailable.
     *
     * @private
     * @param {string} action
     * @param {any} payload
     * @returns {Promise<[any, Error|null]>}
     */
    async _executeFallback(action, payload) {
        if (typeof this.fallbackHandler !== 'function') {
            return [null, new Error(`WorkerPool fallbackHandler not provided for action: ${action}`)];
        }

        try {
            const outcome = await this.fallbackHandler(action, payload);
            if (Array.isArray(outcome)) {
                return [outcome[0], outcome[1]];
            }
            return [outcome, null];
        } catch (err) {
            return [null, err instanceof Error ? err : new Error(String(err))];
        }
    }

    /**
     * Shuts down all workers and cancels pending tasks.
     *
     * @returns {Promise<void>}
     */
    async terminate() {
        this.terminating = true;

        // Drain active tasks with rejection
        for (const [taskId, record] of this.activeTasks.entries()) {
            this._cleanupTask(taskId);
            record.resolve([null, new Error('WorkerPool terminated')]);
        }

        // Drain pending queue
        while (this.taskQueue.length > 0) {
            const task = this.taskQueue.shift();
            if (task.timer) {
                globalThis.clearTimeout(task.timer);
            }
            task.resolve([null, new Error('WorkerPool terminated')]);
        }

        // Terminate all workers
        const promises = this.workers.map(w => {
            try {
                return w.handle.terminate();
            } catch {
                return Promise.resolve();
            }
        });

        await Promise.all(promises);
        this.workers = [];
        this.terminating = false;
        this.initialized = false;
    }

    /**
     * Returns pool telemetry status.
     *
     * @returns {{ totalWorkers: number, busyWorkers: number, idleWorkers: number, queuedTasks: number, maxWorkers: number }}
     */
    get status() {
        const busyCount = this.workers.filter(w => w.busy).length;
        return {
            totalWorkers: this.workers.length,
            busyWorkers: busyCount,
            idleWorkers: this.workers.length - busyCount,
            queuedTasks: this.taskQueue.length,
            maxWorkers: this.maxWorkers || 0
        };
    }
}
