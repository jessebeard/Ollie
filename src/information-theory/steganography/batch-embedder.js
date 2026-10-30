import { ChunkManager } from './chunk-manager.js';
import { createManifest, deriveMacKey } from './carrier-manifest.js';
import { KeyDerivation } from '../cryptography/pbkdf2.js';
import { bytesToBase64 } from '../../utils/encoding.js';
import { getCarrierPool } from '../../codec/carrier-pool.js';

/** Fraction of a carrier's scanned capacity actually used for payload. */
const CHUNK_SAFETY_FACTOR = 0.8;
import { JpegEncoder } from '../../codec/encoder.js';
import { StegoEngine } from './stego-engine.js';
import { sealOpaque } from './opaque-container.js';
import { logger } from '../../utils/logger.js';

/**
 * BatchEmbedder - Handles embedding data across multiple images
 */
export class BatchEmbedder {

    /**
     * Upper-bound template of the per-chunk container metadata used for
     * capacity estimation. It must never serialize smaller than the real
     * metadata written at embed time, or estimates overshoot capacity.
     *
     * @returns {Object}
     */
    static CAPACITY_METADATA_TEMPLATE() {
        return {
            filename: 'vault.json',
            chunk: { id: '0'.repeat(36), index: 999, total: 9999 },
            checksum: 4294967295,
            originalLength: 99999999,
            blockCount: 999999
        };
    }

    /**
     * Single source of truth for carrier capacity in container mode.
     * Both the batch embedder and the capacity scanner must use this.
     *
     * @param {Array<Int32Array>} blocks
     * @param {Object} [opts] - { eccProfile?, encrypted?, ecc? }
     * @param {Object} [_extraMetadata] - Caller metadata merged over the template
     * @returns {number} Capacity in bytes available for payload
     */
    static calculateCarrierCapacity(blocks, opts = {}, _extraMetadata = {}) {
        return StegoEngine.calculateCapacity(blocks, opts);
    }
    /**
     * Embeds data across multiple images with capacity-aware chunking
     * 
     * @param {Uint8Array} data - Data to embed
     * @param {Array<File>} imageFiles - List of image files (File objects)
     * @param {Object} options - Options
     * @param {string} [options.password] - Password for encryption
     * @param {string} [options.filename] - Original filename to preserve in metadata
     * @param {string} [options.eccProfile='Medium'] - ECC profile: 'Low', 'Medium', 'High', 'Ultra', 'Extreme'
     * @param {boolean} [options.ecc=true] - Enable error correction
     * @param {{revision: number}} [options.manifest] - When present, sign and stamp an authenticated carrier manifest
     * @param {number} [options.threshold] - CSS mode: required unique carriers k of n; replicates sealed payload per carrier
     * @param {number} [options.margin=512] - Safety margin (bytes) reserved during erasure allocation planning
     * @param {Function} [onProgress] - Callback (current, total, status)
     * @returns {Promise<[Array<{name: string, data: Uint8Array, sourceIndex: number}>|null, Error|null]>} Result tuple of [outputFiles, error]
     */
    async embed(data, imageFiles, options = {}, onProgress = null) {

        if (onProgress) onProgress(0, imageFiles.length, 'Normalizing images...');

        const isBrowser = typeof window !== 'undefined' && typeof Image !== 'undefined';
        const normalizedImages = [];

        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];

            try {

                const arrayBuffer = await file.arrayBuffer();
                const originalBytes = new Uint8Array(arrayBuffer);

                const isJpeg = originalBytes[0] === 0xFF && originalBytes[1] === 0xD8;

                let jpegBytes;

                if (isJpeg) {

                    jpegBytes = originalBytes;
                    logger.debug(`${file.name}: Using original JPEG bytes (lossless path)`);
                } else {

                    let imageData;

                    if (isBrowser) {

                        const img = new Image();
                        const url = URL.createObjectURL(file);

                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
                            img.src = url;
                        });

                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        imageData = ctx.getImageData(0, 0, img.width, img.height);

                        URL.revokeObjectURL(url);
                    } else {

                        throw new Error(`Non-JPEG files not supported in Node.js: ${file.name}`);
                    }

                    const encoder = new JpegEncoder();
                    jpegBytes = await encoder.encode(imageData);
                    logger.debug(`${file.name}: Converted to JPEG`);
                }

                normalizedImages.push({
                    file: file,
                    jpegBytes: jpegBytes,
                    originalSize: file.size,
                    normalizedSize: jpegBytes.length
                });

                if (onProgress) {
                    onProgress(i + 1, imageFiles.length, `Processed ${file.name}`);
                }
            } catch (error) {
                logger.error(`Failed to process ${file.name}:`, error);
                return [null, new Error(`Failed to process ${file.name}: ${error.message}`)];
            }
        }

        if (onProgress) onProgress(0, normalizedImages.length, 'Analyzing image capacities...');

        const imageCapacities = [];
        let totalCapacity = 0;

        const pool = getCarrierPool();
        const eccProfile = options.eccProfile || 'Medium';
        const useEcc = options.ecc !== false;
        const capacityOpts = { ecc: useEcc, eccProfile, encrypted: !!options.password };
        const extraMetadata = options.filename ? { filename: options.filename } : {};

        const scanTasks = normalizedImages.map(async ({ file, jpegBytes }, i) => {
            const bufferSlice = /** @type {ArrayBuffer} */ (jpegBytes.buffer.slice(jpegBytes.byteOffset, jpegBytes.byteOffset + jpegBytes.byteLength));
            const payloadBytes = new Uint8Array(bufferSlice);

            const isMultithreaded = (/** @type {any} */ (options)).multithreaded !== false;
            const [res, err] = !isMultithreaded
                ? await pool.fallbackHandler('scan-capacity', {
                    jpegBytes: payloadBytes,
                    options: capacityOpts,
                    metadata: extraMetadata
                })
                : await pool.dispatch('scan-capacity', {
                    jpegBytes: payloadBytes,
                    options: capacityOpts,
                    metadata: extraMetadata
                }, [bufferSlice]);

            if (err) {
                return { file, jpegBytes, capacity: 0, index: i, error: new Error(`Failed to decode ${file.name} for capacity calculation: ${err.message}`) };
            }
            return { file, jpegBytes, capacity: res.capacity, index: i, error: null };
        });

        const scanResults = await Promise.all(scanTasks);
        for (let i = 0; i < scanResults.length; i++) {
            const res = scanResults[i];
            if (res.error) return [null, res.error];
            imageCapacities.push({
                file: res.file,
                jpegBytes: res.jpegBytes,
                capacity: res.capacity,
                index: res.index
            });
            totalCapacity += res.capacity;
            if (onProgress) {
                onProgress(i + 1, normalizedImages.length, `Analyzed ${res.file.name}: ${res.capacity} bytes`);
            }
        }

        logger.debug(`Total capacity: ${totalCapacity} bytes, Data: ${data.length} bytes`);

        if (data.length > totalCapacity) {
            return [null, new Error(
                `Insufficient capacity! Data: ${data.length} bytes, Available: ${totalCapacity} bytes. ` +
                `Need ${Math.ceil((data.length - totalCapacity) / 1000)} KB more capacity.`
            )];
        }

        // CSS + erasure coding: seal the payload once under a random DEK,
        // then Cauchy-erasure-code the sealed envelope into n coded stripes
        // distributed across carriers by capacity. Any `threshold` distinct
        // stripes (plus their key shares) recover the payload; the envelope
        // alone reveals nothing.
        const margin = options.margin !== undefined ? options.margin : 64;
        const capacities = imageCapacities.map(c => c.capacity);
        const { planErasureAllocation } = await import('../secret-sharing/cauchy-ec.js');
        const [plan, planErr] = planErasureAllocation(capacities, {
            threshold: options.threshold,
            margin: margin,
            payloadSize: data.length + 28,
            proportional: options.threshold === undefined && imageCapacities.length > 1
        });
        if (planErr || !plan || plan instanceof Error) {
            const errObj = /** @type {any} */ (planErr || plan);
            return [null, new Error(
                `Carrier set cannot host a vault (${data.length}-byte document). ` +
                `Planner said: ${errObj ? errObj.message : 'Erasure allocation failed'}`
            )];
        }

        const k = plan.k;
        const totalBlocks = plan.n;

        // Seal DEK with k-of-totalBlocks Shamir shares matching block counts
        const { sealPayload } = await import('../secret-sharing/css-envelope.js');
        const [sealed, sealErr] = await sealPayload(data, { threshold: k, total: totalBlocks });
        if (sealErr) return [null, new Error(`Threshold sealing failed: ${sealErr.message}`)];

        const envelopeBytes = new Uint8Array(sealed.envelope.iv.length + sealed.envelope.ciphertext.length);
        envelopeBytes.set(sealed.envelope.iv, 0);
        envelopeBytes.set(sealed.envelope.ciphertext, sealed.envelope.iv.length);
        const envelopeSize = envelopeBytes.length;

        const { encodeErasure } = await import('../secret-sharing/cauchy-ec.js');
        const [codedChunks, codeErr] = encodeErasure(envelopeBytes, { k, n: totalBlocks });
        if (codeErr) return [null, new Error(`Erasure coding failed: ${codeErr.message}`)];

        const singleBlockLen = codedChunks.length > 0 ? codedChunks[0].data.length : 0;
        const chunkId = ChunkManager.generateId();
        const carrierItems = [];
        let blockOffset = 0;

        for (let i = 0; i < imageCapacities.length; i++) {
            const info = imageCapacities[i];
            const count = plan.counts[i];
            if (count <= 0) continue;

            const carrierBlocks = codedChunks.slice(blockOffset, blockOffset + count);
            const carrierShares = sealed.shares.slice(blockOffset, blockOffset + count);

            // Pack count blocks into a single contiguous byte buffer
            const carrierBytes = new Uint8Array(count * singleBlockLen);
            for (let b = 0; b < count; b++) {
                carrierBytes.set(carrierBlocks[b].data, b * singleBlockLen);
            }

            const chunkMeta = {
                id: chunkId,
                startIndex: blockOffset,
                count: count,
                index: blockOffset,
                total: totalBlocks,
                k: k,
                stripeSize: singleBlockLen,
                payloadSize: envelopeSize
            };

            carrierItems.push({
                imageInfo: info,
                chunkData: carrierBytes,
                chunkMeta,
                shares: carrierShares
            });

            blockOffset += count;
        }

        logger.debug(
            `Erasure plan: k=${k} totalBlocks=${totalBlocks} stripeSize=${plan.stripeSize} carriers=${carrierItems.length}`
        );

        if (carrierItems.length === 0) {
            return [null, new Error('Nothing to embed')];
        }

        // Signed manifest: one block per participating carrier
        let manifestBlocks = null;
        if (options.manifest) {
            if (!options.password) {
                return [null, new Error('Manifest signing requires a password')];
            }
            const records = carrierItems.map((item, idx) => ({
                index: idx,
                checksum: ChunkManager.calculateChecksum(item.chunkData)
            }));

            const [setSalt, setSaltErr] = await KeyDerivation.generateSalt();
            if (setSaltErr) return [null, setSaltErr];
            const sharedKdf = {
                algo: 'PBKDF2-SHA256',
                iterations: KeyDerivation.ITERATIONS,
                salt: bytesToBase64(setSalt)
            };
            const created = new Date().toISOString();

            // Derive HMAC key once ephemerally for this entire batch; collected when embedding finishes.
            const [macKey, macKeyErr] = await deriveMacKey(options.password, sharedKdf);
            if (macKeyErr || !macKey) {
                return [null, new Error(`Manifest MAC key derivation failed: ${macKeyErr?.message || 'unknown error'}`)];
            }

            manifestBlocks = [];
            for (let i = 0; i < carrierItems.length; i++) {
                const manifestSpec = {
                    chunkSetId: chunkId,
                    records,
                    revision: options.manifest.revision,
                    created,
                    kdf: sharedKdf,
                    macKey,
                    ec: { k, n: totalBlocks, size: envelopeSize, stripeSize: plan.stripeSize }
                };
                if (carrierItems[i].shares && carrierItems[i].shares.length === 1) {
                    manifestSpec.share = {
                        index: carrierItems[i].shares[0].index,
                        threshold: k,
                        data: bytesToBase64(carrierItems[i].shares[0].data)
                    };
                } else if (carrierItems[i].shares && carrierItems[i].shares.length > 1) {
                    manifestSpec.shares = carrierItems[i].shares.map(s => ({
                        index: s.index,
                        threshold: k,
                        data: bytesToBase64(s.data)
                    }));
                }
                const [manifest, manifestErr] = await createManifest(manifestSpec);
                if (manifestErr) return [null, new Error(`Manifest creation failed: ${manifestErr.message}`)];
                manifestBlocks.push(manifest);
            }
        }

        const embeddingTasks = carrierItems.map(async (carrierItem, i) => {
            const { imageInfo, chunkData, chunkMeta } = carrierItem;

            if (onProgress) {
                onProgress(i, carrierItems.length, `Embedding into ${imageInfo.file.name}...`);
            }

            const metadata = {
                filename: options.filename || 'unknown',
                chunk: chunkMeta,
                checksum: ChunkManager.calculateChecksum(chunkData)
            };
            if (manifestBlocks) {
                metadata.manifest = manifestBlocks[i];
            }

            let transcodeOpts;
            if (options.password) {
                const carrierPayload = new TextEncoder().encode(JSON.stringify({
                    data: bytesToBase64(chunkData),
                    metadata
                }));
                const [sealedWire, sealErr] = await sealOpaque(carrierPayload, options.password);
                if (sealErr) {
                    throw new Error(`Failed to seal payload: ${sealErr.message}`);
                }
                const stcSeed = await StegoEngine.resolveSTCSeed(options.password);
                transcodeOpts = {
                    metadata,
                    sealedWire,
                    stcSeed
                };
            } else {
                transcodeOpts = {
                    metadata
                };
            }

            let encodedBytes, transErr;
            if ((/** @type {any} */ (options)).multithreaded === false) {
                [encodedBytes, transErr] = await pool.fallbackHandler('transcode-embed', {
                    jpegBytes: imageInfo.jpegBytes,
                    chunkData,
                    options: transcodeOpts
                });
            } else {
                const jpegBuf = /** @type {ArrayBuffer} */ (imageInfo.jpegBytes.buffer.slice(
                    imageInfo.jpegBytes.byteOffset,
                    imageInfo.jpegBytes.byteOffset + imageInfo.jpegBytes.byteLength
                ));
                const chunkBuf = /** @type {ArrayBuffer} */ (chunkData.buffer.slice(
                    chunkData.byteOffset,
                    chunkData.byteOffset + chunkData.byteLength
                ));
                [encodedBytes, transErr] = await pool.dispatch('transcode-embed', {
                    jpegBytes: new Uint8Array(jpegBuf),
                    chunkData: new Uint8Array(chunkBuf),
                    options: transcodeOpts
                }, [jpegBuf, chunkBuf]);
            }

            if (transErr) {
                throw new Error(`Failed to embed into ${imageInfo.file.name}: ${transErr.message}`);
            }

            return {
                name: `steg_${i}_${imageInfo.file.name}`,
                data: encodedBytes,
                sourceIndex: imageInfo.index
            };
        });

        try {
            const results = await Promise.all(embeddingTasks);
            if (onProgress) {
                onProgress(carrierItems.length, carrierItems.length, 'Done');
            }
            return [results, null];
        } catch (error) {
            logger.error(`Error processing carriers:`, error);
            return [null, error instanceof Error ? error : new Error(String(error))];
        }
    }

    /**
     * Allocate data to images based on their capacities
     * @private
     * @returns {[Array<{imageInfo: Object, chunkData: Uint8Array, chunkMeta: Object}>|null, Error|null]} Result tuple of [chunkAllocations, error]
     */
    allocateDataToImages(data, imageCapacities) {
        const chunks = [];
        const chunkId = ChunkManager.generateId();

        let offset = 0;
        let chunkIndex = 0;

        for (const imageInfo of imageCapacities) {
            if (offset >= data.length) break;

            // 20% headroom absorbs metadata growth and shrinkage retries so a
            // carrier is never asked to hold more than it verifiably can.
            const safeCapacity = Math.floor(imageInfo.capacity * CHUNK_SAFETY_FACTOR);
            const chunkSize = Math.min(safeCapacity, data.length - offset);

            if (chunkSize < 10) {
                logger.warn(`Image ${imageInfo.file.name} has very low capacity (${imageInfo.capacity} bytes), skipping`);
                continue;
            }

            const chunkData = data.slice(offset, offset + chunkSize);

            chunks.push({
                imageInfo: imageInfo,
                chunkData: chunkData,
                chunkMeta: {
                    id: chunkId,
                    index: chunkIndex,
                    total: -1
                }
            });

            offset += chunkSize;
            chunkIndex++;
        }

        const totalChunks = chunks.length;
        for (const chunk of chunks) {
            chunk.chunkMeta.total = totalChunks;
        }

        if (offset < data.length) {
            return [null, new Error(
                `Not enough image capacity! Embedded ${offset} bytes of ${data.length} bytes. ` +
                `Missing ${data.length - offset} bytes.`
            )];
        }

        return [chunks, null];
    }
}
