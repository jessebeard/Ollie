import { ChunkManager } from './chunk-manager.js';
import { createManifest } from './carrier-manifest.js';
import { JpegTranscoder } from '../../codec/transcoder.js';

/** Fraction of a carrier's scanned capacity actually used for payload. */
const CHUNK_SAFETY_FACTOR = 0.8;
import { JpegDecoder } from '../../codec/decoder.js';
import { JpegEncoder } from '../../codec/encoder.js';
import { F5 } from './f5-syndrome.js';
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
     * @param {Object} [extraMetadata] - Caller metadata merged over the template
     * @returns {number} Capacity in bytes available for payload
     */
    static calculateCarrierCapacity(blocks, opts = {}, extraMetadata = {}) {
        const metadata = { ...BatchEmbedder.CAPACITY_METADATA_TEMPLATE(), ...extraMetadata };
        const useEcc = opts.ecc !== false;
        const eccProfile = opts.eccProfile || (metadata && metadata.eccProfile) || 'Medium';

        return F5.calculateCapacity(blocks, {
            format: 'container',
            metadata,
            ecc: useEcc,
            eccProfile,
            encrypted: !!opts.encrypted
        });
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
     * @param {Function} [onProgress] - Callback (current, total, status)
     * @returns {Promise<[Array<{name: string, data: Uint8Array}>|null, Error|null]>} Result tuple of [outputFiles, error]
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

        const [chunks, allocErr] = this.allocateDataToImages(data, imageCapacities);
        if (allocErr) return [null, allocErr];

        // Signed manifest: one block shared verbatim by every carrier so any
        // surviving subset authenticates the whole chunk set on load.
        let manifestBlock = null;
        if (options.manifest) {
            if (!options.password) {
                return [null, new Error('Manifest signing requires a password')];
            }
            const records = chunks.map(c => ({
                index: c.chunkMeta.index,
                checksum: ChunkManager.calculateChecksum(c.chunkData)
            }));
            const [manifest, manifestErr] = await createManifest({
                chunkSetId: chunks[0].chunkMeta.id,
                records,
                revision: options.manifest.revision,
                password: options.password
            });
            if (manifestErr) return [null, new Error(`Manifest creation failed: ${manifestErr.message}`)];
            manifestBlock = manifest;
        }

        const results = [];
        const transcoder = new JpegTranscoder();

        for (let i = 0; i < chunks.length; i++) {
            const { imageInfo, chunkData, chunkMeta } = chunks[i];

            if (onProgress) {
                onProgress(i, chunks.length, `Embedding into ${imageInfo.file.name}...`);
            }

            try {

                const metadata = {
                    filename: options.filename || 'unknown',
                    chunk: chunkMeta,
                    checksum: ChunkManager.calculateChecksum(chunkData),
                    ecc: options.ecc !== false,
                    eccProfile: options.eccProfile || 'Medium'
                };
                if (manifestBlock) {
                    metadata.manifest = manifestBlock;
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
                    data: encodedBytes
                });

            } catch (error) {
                logger.error(`Error processing ${imageInfo.file.name}:`, error);
                return [null, new Error(`Failed to embed into ${imageInfo.file.name}: ${error.message}`)];
            }
        }

        if (onProgress) {
            onProgress(chunks.length, chunks.length, 'Done');
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
