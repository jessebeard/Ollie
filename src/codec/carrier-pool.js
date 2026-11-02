/**
 * Shared Carrier Processing Worker Pool.
 *
 * Provides a managed pool of background workers for parallel JPEG capacity
 * analysis, steganographic transcoding/embedding, and payload extraction.
 */
import { WorkerPool } from '../utils/concurrency/worker-pool.js';
import { JpegDecoder } from './decoder.js';
import { JpegTranscoder } from './transcoder.js';
import { BatchEmbedder } from '../information-theory/steganography/batch-embedder.js';
import { StegoEngine } from '../information-theory/steganography/stego-engine.js';
import { parseStegoPayload } from '../information-theory/steganography/stego-payload.js';

let sharedCarrierPool = null;

/**
 * Returns the singleton carrier worker pool, initialized on first use.
 *
 * @param {Object} [options]
 * @param {number} [options.maxWorkers]
 * @param {boolean} [options.enabled=true]
 * @returns {WorkerPool}
 */
export function getCarrierPool(options = {}) {
    if (!sharedCarrierPool) {
        sharedCarrierPool = new WorkerPool({
            workerScript: new URL('./carrier.worker.js', import.meta.url),
            maxWorkers: options.maxWorkers,
            enabled: options.enabled !== false,
            fallbackHandler: async (action, payload) => {
                if (action === 'scan-capacity') {
                    const decoder = new JpegDecoder();
                    const [info, err] = await decoder.decode(payload.jpegBytes, { skipExtraction: true, coefficientsOnly: true });
                    if (err) return [null, err];

                    const allBlocks = [];
                    if (info && info.coefficients) {
                        for (const compId in info.coefficients) {
                            const comp = info.coefficients[compId];
                            if (comp && comp.blocks) {
                                for (let i = 0; i < comp.blocks.length; i++) {
                                    allBlocks.push(comp.blocks[i]);
                                }
                            }
                        }
                    }

                    let capacity = BatchEmbedder.calculateCarrierCapacity(allBlocks, payload.options || {}, payload.metadata);
                    if (capacity === 0 && payload.options && payload.options.ecc !== false) {
                        capacity = BatchEmbedder.calculateCarrierCapacity(allBlocks, { ...payload.options, ecc: false }, payload.metadata);
                    }
                    return [{ capacity, blockCount: allBlocks.length }, null];
                }

                if (action === 'transcode-embed') {
                    const transcoder = new JpegTranscoder();
                    return transcoder.updateSecret(payload.jpegBytes, payload.chunkData, payload.options || {});
                }

                if (action === 'extract-payload') {
                    const decoder = new JpegDecoder();
                    const [info, decodeErr] = await decoder.decode(payload.jpegBytes, { skipExtraction: true, coefficientsOnly: true });
                    if (decodeErr) return [null, decodeErr];

                    const allBlocks = [];
                    if (info && info.coefficients) {
                        for (const compId in info.coefficients) {
                            const comp = info.coefficients[compId];
                            if (comp && comp.blocks) {
                                for (let i = 0; i < comp.blocks.length; i++) {
                                    allBlocks.push(comp.blocks[i]);
                                }
                            }
                        }
                    }

                    if (allBlocks.length === 0) {
                        return [{ secretData: null, secretMetadata: null }, null];
                    }

                    const [extractedPayload, extractErr] = await StegoEngine.extract(allBlocks, payload.password, payload.options || {});
                    if (extractErr || !extractedPayload) {
                        return [{ secretData: null, secretMetadata: null }, null];
                    }

                    let secretData = extractedPayload;
                    let secretMetadata = null;
                    const [parsedPayload, parseErr] = parseStegoPayload(extractedPayload);
                    if (!parseErr && parsedPayload) {
                        secretData = parsedPayload.secretData;
                        secretMetadata = parsedPayload.secretMetadata;
                    }

                    return [{ secretData, secretMetadata }, null];
                }

                return [null, new Error(`carrier fallback: unrecognized action "${action}"`)];
            }
        });
    }

    return sharedCarrierPool;
}
