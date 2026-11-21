import { describe, it, expect } from '../test-runner.js';
import { WorkerPool } from '../../../src/utils/concurrency/worker-pool.js';
import { getHardwareConcurrency } from '../../../src/utils/concurrency/worker-adapter.js';

const TEST_WORKER_URL = new URL('./fixtures/test.worker.js', import.meta.url);

describe('Universal WorkerPool Infrastructure', () => {
    it('initializes hardware concurrency with n - 1 cores by default', async () => {
        const hardwareCores = await getHardwareConcurrency();
        const expectedDefault = Math.max(1, hardwareCores - 1);

        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL
        });

        const [ok, err] = await pool.init();
        expect(err).toBeNull();
        expect(ok).toBe(true);
        expect(pool.maxWorkers).toBe(expectedDefault);

        await pool.terminate();
    });

    it('honors explicitly specified maxWorkers override', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 2
        });

        await pool.init();
        expect(pool.maxWorkers).toBe(2);

        await pool.terminate();
    });

    it('dispatches simple task and receives [value, null] Result tuple', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 2
        });

        const [reply, err] = await pool.dispatch('ping');
        expect(err).toBeNull();
        expect(reply).toBe('pong');

        const [addRes, addErr] = await pool.dispatch('add', { a: 15, b: 27 });
        expect(addErr).toBeNull();
        expect(addRes).toBe(42);

        await pool.terminate();
    });

    it('propagates worker-returned errors as deterministic [null, Error] tuples', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 1
        });

        const [res, err] = await pool.dispatch('fail', { message: 'Carrier corrupted' });
        expect(res).toBeNull();
        expect(err instanceof Error).toBe(true);
        expect(err.message).toBe('Carrier corrupted');

        await pool.terminate();
    });

    it('captures unhandled worker exceptions and returns them as Result tuples', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 1
        });

        const [res, err] = await pool.dispatch('throw', { message: 'Unexpected panic' });
        expect(res).toBeNull();
        expect(err instanceof Error).toBe(true);
        expect(err.message).toBe('Unexpected panic');

        await pool.terminate();
    });

    it('handles concurrent task queueing across limited workers', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 2
        });

        // Submit 6 parallel tasks with short delays
        const tasks = [1, 2, 3, 4, 5, 6].map(i =>
            pool.dispatch('delay', { ms: 15, result: `done-${i}` })
        );

        const outcomes = await Promise.all(tasks);

        for (let i = 0; i < 6; i++) {
            const [val, err] = outcomes[i];
            expect(err).toBeNull();
            expect(val).toBe(`done-${i + 1}`);
        }

        await pool.terminate();
    });

    it('supports zero-copy ArrayBuffer transfer lists', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 1
        });

        const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const buffer = data.buffer;

        const [echoBuffer, err] = await pool.dispatch('transfer', { buffer }, [buffer]);
        expect(err).toBeNull();
        expect(echoBuffer instanceof ArrayBuffer).toBe(true);

        const echoedArray = new Uint8Array(echoBuffer);
        expect(echoedArray.length).toBe(8);
        expect(echoedArray[0]).toBe(1);
        expect(echoedArray[7]).toBe(8);

        await pool.terminate();
    });

    it('enforces task timeouts and recycles stuck workers', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 1,
            defaultTimeoutMs: 3000
        });

        // Task with delay longer than timeout
        const [res, err] = await pool.dispatch('delay', { ms: 500, result: 'late' }, [], { timeoutMs: 80 });
        expect(res).toBeNull();
        expect(err instanceof Error).toBe(true);
        expect(err.message.includes('timed out')).toBe(true);

        // Verify pool recovered and can process subsequent tasks
        const [pingRes, pingErr] = await pool.dispatch('ping');
        expect(pingErr).toBeNull();
        expect(pingRes).toBe('pong');

        await pool.terminate();
    });

    it('executes fallbackHandler when worker threading is disabled', async () => {
        const fallbackExecuted = [];

        const pool = new WorkerPool({
            enabled: false,
            fallbackHandler: async (action, payload) => {
                fallbackExecuted.push(action);
                if (action === 'calc') return [payload * 2, null];
                return [null, new Error('Unknown fallback action')];
            }
        });

        const [res, err] = await pool.dispatch('calc', 21);
        expect(err).toBeNull();
        expect(res).toBe(42);
        expect(fallbackExecuted).toEqual(['calc']);

        await pool.terminate();
    });

    it('cleanly terminates pool and rejects pending tasks', async () => {
        const pool = new WorkerPool({
            workerScript: TEST_WORKER_URL,
            maxWorkers: 1
        });
        await pool.init();

        // Launch a long task
        const longTask = pool.dispatch('delay', { ms: 500, result: 'never' });

        // Allow task to be dispatched to worker
        await new Promise(r => setTimeout(r, 30));

        // Terminate while task is active
        await pool.terminate();

        const [res, err] = await longTask;
        expect(res).toBeNull();
        expect(err instanceof Error).toBe(true);
        expect(err.message).toBe('WorkerPool terminated');
    });
});
