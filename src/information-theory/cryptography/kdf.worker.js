/**
 * Dedicated Background Worker for Argon2id Memory-Hard Key Derivation.
 *
 * Runs the memory-hard WebAssembly Argon2id derivation (m=64MB, t=3, p=1)
 * completely off the main thread, transferring output key buffers with zero copying.
 */
import { initializeWorkerRuntime } from '../../utils/concurrency/worker-runtime.js';
import { deriveArgon2id } from '../../vendor/argon2/index.js';

initializeWorkerRuntime(async (action, payload) => {
    switch (action) {
        case 'derive-argon2id': {
            const masterKey = await deriveArgon2id(payload);
            // Transfer masterKey buffer back to caller with zero-copy
            return [masterKey, null, [masterKey.buffer]];
        }
        default:
            return [null, new Error(`kdf.worker: unrecognized action "${action}"`)];
    }
});
