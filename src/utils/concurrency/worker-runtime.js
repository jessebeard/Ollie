/**
 * Universal Worker Runtime Helper.
 *
 * Included inside worker scripts to normalize message communication
 * between Browser Web Workers and Node.js worker_threads.
 */
import { serializeTuple, serializeError } from './tuple-serializer.js';

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Initializes a worker task listener with automatic Result tuple serialization.
 *
 * @param {Function} taskHandler - async (action, payload) => [value, error, transferList?]
 */
export async function initializeWorkerRuntime(taskHandler) {
    let postReply;

    if (isNode) {
        const { parentPort } = await import('node:worker_threads');
        if (!parentPort) {
            throw new Error('initializeWorkerRuntime: parentPort is null; must be executed in a worker thread');
        }

        postReply = (wire, transfer) => {
            if (transfer && transfer.length > 0) {
                parentPort.postMessage(wire, transfer);
            } else {
                parentPort.postMessage(wire);
            }
        };

        parentPort.on('message', async (request) => {
            await handleIncoming(request, postReply, taskHandler);
        });
    } else {
        postReply = (wire, transfer) => {
            if (transfer && transfer.length > 0) {
                globalThis.postMessage(wire, transfer);
            } else {
                globalThis.postMessage(wire);
            }
        };

        globalThis.addEventListener('message', async (event) => {
            await handleIncoming(event.data, postReply, taskHandler);
        });
    }
}

/**
 * Internal request processor.
 *
 * @param {Object} request - { id, action, payload }
 * @param {Function} postReply
 * @param {Function} taskHandler
 */
async function handleIncoming(request, postReply, taskHandler) {
    if (!request || typeof request !== 'object' || !request.id) {
        return;
    }

    const { id, action, payload } = request;

    try {
        const handlerOutcome = await taskHandler(action, payload);
        let resultTuple;
        let transfer = [];

        if (Array.isArray(handlerOutcome)) {
            // [value, error, transferList]
            const [val, err, tx] = handlerOutcome;
            resultTuple = [val, err];
            if (Array.isArray(tx)) {
                transfer = tx;
            }
        } else {
            resultTuple = [handlerOutcome, null];
        }

        const serialized = serializeTuple(/** @type {[any, Error|null]} */ (resultTuple));
        postReply({ id, ...serialized }, transfer);
    } catch (unhandledException) {
        const err = unhandledException instanceof Error ? unhandledException : new Error(String(unhandledException));
        const serialized = {
            ok: false,
            value: null,
            error: serializeError(err)
        };
        postReply({ id, ...serialized });
    }
}
