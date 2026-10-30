/**
 * Test Worker fixture for WorkerPool unit and integration tests.
 */
import { initializeWorkerRuntime } from '../../../../src/utils/concurrency/worker-runtime.js';

initializeWorkerRuntime(async (action, payload) => {
    switch (action) {
        case 'ping':
            return ['pong', null];

        case 'echo':
            return [payload, null];

        case 'add':
            return [payload.a + payload.b, null];

        case 'fail':
            return [null, new Error(payload?.message || 'Worker intentional failure')];

        case 'throw':
            throw new Error(payload?.message || 'Worker thrown exception');

        case 'delay':
            await new Promise((resolve) => setTimeout(resolve, payload.ms || 10));
            return [payload.result !== undefined ? payload.result : 'delayed-done', null];

        case 'transfer': {
            // Echo back the transferred buffer
            const buffer = payload.buffer;
            return [buffer, null, [buffer]];
        }

        default:
            return [null, new Error(`Unknown test action: ${action}`)];
    }
});
