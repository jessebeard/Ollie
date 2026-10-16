import { ChunkManager } from './chunk-manager.js';
import { createManifest } from './carrier-manifest.js';
import { KeyDerivation } from '../cryptography/pbkdf2.js';
import { bytesToBase64 } from '../../utils/encoding.js';
import { JpegTranscoder } from '../../codec/transcoder.js';

/** Fraction of a carrier's scanned capacity actually used for payload. */
const CHUNK_SAFETY_FACTOR = 0.8;
import { JpegDecoder } from '../../codec/decoder.js';
import { JpegEncoder } from '../../codec/encoder.js';
import { StegoEngine } from './stego-engine.js';
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

        for (let i = 0; i < normalizedImages.length; i++) {
            const { file, jpegBytes } = normalizedImages[i];

            const decoder = new JpegDecoder();
            const [decoded, decodeErr] = await decoder.decode(jpegBytes, { skipExtraction: true, coefficientsOnly: true });
            if (decodeErr) return [null, new Error(`Failed to decode ${file.name} for capacity calculation: ${decodeErr.message}`)];

            const allBlocks = [];

            if (decoded.coefficients) {
                for (const compId in decoded.coefficients) {
                    const compData = decoded.coefficients[compId];
                    if (compData && compData.blocks) {

                        for (let k = 0; k < compData.blocks.length; k++) {
                            allBlocks.push(compData.blocks[k]);
                        }
                    }
                }
            }

            if (allBlocks.length === 0 && decoder.components) {
                for (const compId in decoder.components) {
                    const compData = decoder.components[compId];
                    if (compData && compData.blocks) {

                        for (let k = 0; k < compData.blocks.length; k++) {
                            allBlocks.push(compData.blocks[k]);
                        }
                    }
                }
            }

            if (allBlocks.length === 0) {
                logger.error('Failed to extract blocks. Decoder state:', {
                    hasCoefficients: !!decoded.coefficients,
                    hasComponents: !!decoder.components,
                    decodedKeys: Object.keys(decoded),
                    componentKeys: decoder.components ? Object.keys(decoder.components) : []
                });
                return [null, new Error(`Failed to extract blocks from ${file.name} for capacity calculation`)];
            }

            const eccProfile = options.eccProfile || 'Medium';
            const useEcc = options.ecc !== false;
            const capacityOpts = { ecc: useEcc, eccProfile, encrypted: !!options.password };
            const extraMetadata = options.filename ? { filename: options.filename } : {};

            let capacity = BatchEmbedder.calculateCarrierCapacity(allBlocks, capacityOpts, extraMetadata);

            if (capacity === 0 && useEcc) {
                capacity = BatchEmbedder.calculateCarrierCapacity(
                    allBlocks, { ...capacityOpts, ecc: false }, extraMetadata
                );
                logger.debug(`${file.name}: ECC capacity 0, fallback to no-ECC: ${capacity} bytes`);
            }

            imageCapacities.push({
                file: file,
                jpegBytes: jpegBytes,
                capacity: capacity,
                index: i
            });

            totalCapacity += capacity;

            if (onProgress) {
                onProgress(i + 1, imageFiles.length, `Analyzed ${file.name}: ${capacity} bytes`);
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
        if (planErr) {
            return [null, new Error(
                `Carrier set cannot host a vault (${data.length}-byte document). ` +
                `Planner said: ${planErr.message}`
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

            manifestBlocks = [];
            for (let i = 0; i < carrierItems.length; i++) {
                const manifestSpec = {
                    chunkSetId: chunkId,
                    records,
                    revision: options.manifest.revision,
                    password: options.password,
                    created,
                    kdf: sharedKdf,
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

        const results = [];
        const transcoder = new JpegTranscoder();

        for (let i = 0; i < carrierItems.length; i++) {
            const { imageInfo, chunkData, chunkMeta } = carrierItems[i];

            if (onProgress) {
                onProgress(i, carrierItems.length, `Embedding into ${imageInfo.file.name}...`);
            }

            try {
                const metadata = {
                    filename: options.filename || 'unknown',
                    chunk: chunkMeta,
                    checksum: ChunkManager.calculateChecksum(chunkData)
                };
                if (manifestBlocks) {
                    metadata.manifest = manifestBlocks[i];
                }

                const [encodedBytes, transErr] = await transcoder.updateSecret(imageInfo.jpegBytes, chunkData, {
                    metadata: metadata,
                    password: options.password
                });

                if (transErr) {
                    return [null, new Error(`Failed to embed into ${imageInfo.file.name}: ${transErr.message}`)];
                }

                results.push({
                    name: `steg_${i}_${imageInfo.file.name}`,
                    data: encodedBytes,
                    sourceIndex: imageInfo.index
                });

            } catch (error) {
                logger.error(`Error processing ${imageInfo.file.name}:`, error);
                return [null, new Error(`Failed to embed into ${imageInfo.file.name}: ${error.message}`)];
            }
        }

        if (onProgress) {
            onProgress(carrierItems.length, carrierItems.length, 'Done');
        }

        return [results, null];
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
