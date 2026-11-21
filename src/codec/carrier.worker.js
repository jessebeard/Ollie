/**
 * Dedicated Background Worker for JPEG Carrier Processing.
 *
 * Runs per-carrier capacity scanning, lossless coefficient transcoding/embedding,
 * and steganographic payload extraction completely in parallel background workers.
 */
import { initializeWorkerRuntime } from '../utils/concurrency/worker-runtime.js';
import { JpegDecoder } from './decoder.js';
import { JpegTranscoder } from './transcoder.js';
import { BatchEmbedder } from '../information-theory/steganography/batch-embedder.js';
import { StegoEngine } from '../information-theory/steganography/stego-engine.js';
import { parseStegoPayload } from '../information-theory/steganography/stego-payload.js';

initializeWorkerRuntime(async (action, payload) => {
    switch (action) {
        case 'scan-capacity': {
            const { jpegBytes, options, metadata } = payload;
            if (!jpegBytes || !(jpegBytes instanceof Uint8Array)) {
                return [null, new Error('carrier.worker: scan-capacity requires Uint8Array jpegBytes')];
            }

            const decoder = new JpegDecoder();
            const [info, err] = await decoder.decode(jpegBytes, { skipExtraction: true, coefficientsOnly: true });
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

            let capacity = BatchEmbedder.calculateCarrierCapacity(allBlocks, options || {}, metadata);
            if (capacity === 0 && options && options.ecc !== false) {
                capacity = BatchEmbedder.calculateCarrierCapacity(allBlocks, { ...options, ecc: false }, metadata);
            }
            return [{ capacity, blockCount: allBlocks.length }, null];
        }

        case 'transcode-embed': {
            const { jpegBytes, chunkData, options } = payload;
            if (!jpegBytes || !(jpegBytes instanceof Uint8Array)) {
                return [null, new Error('carrier.worker: transcode-embed requires Uint8Array jpegBytes')];
            }
            if (!chunkData || !(chunkData instanceof Uint8Array)) {
                return [null, new Error('carrier.worker: transcode-embed requires Uint8Array chunkData')];
            }

            const transcoder = new JpegTranscoder();
            const [encodedBytes, transErr] = await transcoder.updateSecret(jpegBytes, chunkData, options || {});
            if (transErr) return [null, transErr];

            // Transfer encodedBytes buffer back with zero-copy
            return [encodedBytes, null, [encodedBytes.buffer]];
        }

        case 'extract-payload': {
            const { jpegBytes, password, stcSeed, options } = payload;
            if (!jpegBytes || !(jpegBytes instanceof Uint8Array)) {
                return [null, new Error('carrier.worker: extract-payload requires Uint8Array jpegBytes')];
            }

            const decoder = new JpegDecoder();
            const [info, decodeErr] = await decoder.decode(jpegBytes, { skipExtraction: true, coefficientsOnly: true });
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

            // Subkey boundary: if stcSeed is provided (or password omitted), extract candidate wires without master password
            const seed = stcSeed || (options && options.stcSeed);
            if (!password && seed) {
                const candidateWires = StegoEngine.extractCandidateWires(allBlocks, { stcSeed: seed, ...(options || {}) });
                if (candidateWires.length === 0) {
                    if (options && options.failFastNoContainer) {
                        return [{ secretData: null, secretMetadata: null }, new Error('No steganographic container found')];
                    }
                    return [{ secretData: null, secretMetadata: null }, null];
                }
                const transferables = [];
                for (const w of candidateWires) {
                    transferables.push(w.buffer);
                }
                return [{ candidateWires, secretData: null, secretMetadata: null }, null, transferables];
            }

            const [extractedPayload, extractErr] = await StegoEngine.extract(allBlocks, password, options || {});
            if (extractErr || !extractedPayload) {
                if (options && options.failFastNoContainer) {
                    return [{ secretData: null, secretMetadata: null }, extractErr || new Error('No steganographic container found')];
                }
                return [{ secretData: null, secretMetadata: null }, null];
            }

            let secretData = extractedPayload;
            let secretMetadata = null;
            const [parsedPayload, parseErr] = parseStegoPayload(extractedPayload);
            if (!parseErr && parsedPayload) {
                secretData = parsedPayload.secretData;
                secretMetadata = parsedPayload.secretMetadata;
            }

            const transferables = [];
            if (secretData instanceof Uint8Array) {
                if (secretData.byteOffset !== 0 || secretData.byteLength !== secretData.buffer.byteLength) {
                    secretData = secretData.slice();
                }
                transferables.push(secretData.buffer);
            }
            return [{ secretData, secretMetadata }, null, transferables];
        }

        default:
            return [null, new Error(`carrier.worker: unrecognized action "${action}"`)];
    }
});
