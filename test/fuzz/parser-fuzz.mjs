import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeedCorpus, mutate, makeRng } from './mutation-engine.mjs';

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker-parse.mjs');
const TIMEOUT_MS = 700;

function runInWorker(bytes, timeoutMs) {
    return new Promise((resolve) => {
        let worker;
        try {
            worker = new Worker(WORKER_PATH);
        } catch (e) {
            resolve({ kind: 'spawn-error', detail: e.message });
            return;
        }

        const timer = setTimeout(() => {
            worker.terminate();
            resolve({ kind: 'TIMEOUT' });
        }, timeoutMs);

        worker.once('message', (msg) => {
            clearTimeout(timer);
            worker.terminate();
            resolve({ kind: msg.kind === 'done' ? 'done' : 'unknown', outcome: msg.outcome });
        });
        worker.once('error', (/** @type {Error} */ e) => {
            clearTimeout(timer);
            resolve({ kind: 'WORKER-ERROR', detail: e.message });
        });
        worker.postMessage({ bytes });
    });
}

/**
 * Parser fuzz slice. Every mutation must terminate inside the timeout and
 * produce a bounded outcome (parsed / rejected). A hang or allocation bomb
 * is a defect.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runParserFuzz(scale = 1) {
    const seeds = loadSeedCorpus();
    const iterations = 12 * scale;

    for (let i = 0; i < iterations; i++) {
        const rng = makeRng((i * 7919 + 13) >>> 0);
        const seedA = seeds[i % seeds.length];
        const seedB = seeds[(i + 1) % seeds.length];
        const mutated = mutate(seedA.bytes, seedB.bytes, rng);

        // Transfer a copy so the parent corpus stays intact.
        const copy = Uint8Array.from(mutated);
        const outcome = await runInWorker(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength), TIMEOUT_MS);

        if (outcome.kind === 'TIMEOUT') {
            throw new Error(`iteration ${i}: parser HANG (>${TIMEOUT_MS}ms) - allocation bomb or infinite loop`);
        }
        if (outcome.kind === 'WORKER-ERROR') {
            throw new Error(`iteration ${i}: worker crashed hard: ${outcome.detail}`);
        }
        if (outcome.kind !== 'done') {
            throw new Error(`iteration ${i}: unexpected worker outcome ${outcome.kind}`);
        }
        // Any of parsed/rejected/decode-thrown outcomes are acceptable; the
        // contract under test is termination + isolation, which held.
    }
}
