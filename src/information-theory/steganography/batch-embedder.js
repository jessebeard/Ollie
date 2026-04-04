import { ChunkManager } from './chunk-manager.js';
import { JpegTranscoder } from '../../codec/transcoder.js';
import { JpegDecoder } from '../../codec/decoder.js';
import { JpegEncoder } from '../../codec/encoder.js';
import { F5 } from './f5-syndrome.js';

/**
 * BatchEmbedder - Handles embedding data across multiple images
 */
export class BatchEmbedder {
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
     * @param {Function} [onProgress] - Callback (current, total, status)
     * @returns {Promise<Array<{name: string, data: Uint8Array}>>} Array of output files
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
                    console.log(`${file.name}: Using original JPEG bytes (lossless path)`);
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
                    console.log(`${file.name}: Converted to JPEG`);
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
                console.error(`Failed to process ${file.name}:`, error);
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
            if (decodeErr) throw decodeErr;

            // Optimization: Pre-allocate target array size to avoid garbage
            // collection and memory reallocation overhead during large pushes.
            let totalBlocks = 0;

            if (decoded.coefficients) {
                for (const compId in decoded.coefficients) {
                    const compData = decoded.coefficients[compId];
                    if (compData && compData.blocks) {
                        totalBlocks += compData.blocks.length;
                    }
                }
            }

            if (totalBlocks === 0 && decoder.components) {
                for (const compId in decoder.components) {
                    const compData = decoder.components[compId];
                    if (compData && compData.blocks) {
                        totalBlocks += compData.blocks.length;
                    }
                }
            }

            const allBlocks = new Array(totalBlocks);
            let blockIdx = 0;

            if (decoded.coefficients && blockIdx < totalBlocks) {
                for (const compId in decoded.coefficients) {
                    const compData = decoded.coefficients[compId];
                    if (compData && compData.blocks) {
                        const blocks = compData.blocks;
                        const len = blocks.length;
                        for (let k = 0; k < len; k++) {
                            allBlocks[blockIdx++] = blocks[k];
                        }
                    }
                }
            }

            if (blockIdx === 0 && decoder.components) {
                for (const compId in decoder.components) {
                    const compData = decoder.components[compId];
                    if (compData && compData.blocks) {
                        const blocks = compData.blocks;
                        const len = blocks.length;
                        for (let k = 0; k < len; k++) {
                            allBlocks[blockIdx++] = blocks[k];
                        }
                    }
                }
            }

            if (allBlocks.length === 0) {
                console.error('Failed to extract blocks. Decoder state:', {
                    hasCoefficients: !!decoded.coefficients,
                    hasComponents: !!decoder.components,
                    decodedKeys: Object.keys(decoded),
                    componentKeys: decoder.components ? Object.keys(decoder.components) : []
                });
                return [null, new Error(`Failed to extract blocks from ${file.name} for capacity calculation`)];
            }

            const representativeMetadata = {
                filename: options.filename || 'placeholder_filename.ext',
                chunk: { index: 99, total: 99, start: 999999, end: 999999 },
                checksum: '0'.repeat(32)
            };

            const eccProfile = options.eccProfile || 'Medium';
            const useEcc = options.ecc !== false;

            let capacity = F5.calculateCapacity(allBlocks, {
                format: 'container',
                metadata: representativeMetadata,
                ecc: useEcc,
                eccProfile: eccProfile,
                encrypted: !!options.password
            });

            if (capacity === 0 && useEcc) {
                capacity = F5.calculateCapacity(allBlocks, {
                    format: 'container',
                    metadata: representativeMetadata,
                    ecc: false,
                    encrypted: !!options.password
                });
                console.log(`${file.name}: ECC capacity 0, fallback to no-ECC: ${capacity} bytes`);
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

        console.log(`Total capacity: ${totalCapacity} bytes, Data: ${data.length} bytes`);

        if (data.length > totalCapacity) {
            return [null, new Error(
                `Insufficient capacity! Data: ${data.length} bytes, Available: ${totalCapacity} bytes. ` +
                `Need ${Math.ceil((data.length - totalCapacity) / 1000)} KB more capacity.`
            )];
        }

        const [chunks, allocErr] = this.allocateDataToImages(data, imageCapacities);
        if (allocErr) return [null, allocErr];

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
                console.error(`Error processing ${imageInfo.file.name}:`, error);
                return [null, new Error(`Failed to embed into ${imageInfo.file.name}: ${error.message}`)];
            }
        }

        if (onProgress) {
            onProgress(chunks.length, chunks.length, 'Done');
        }

        return [results, null];
    }

    /**
     * Estimate capacity of a decoded JPEG
     * @private
     */
    estimateCapacity(decoded) {

        const totalBlocks = Math.ceil(decoded.width / 8) * Math.ceil(decoded.height / 8) * 3;

        const estimatedCapacity = Math.floor(totalBlocks * 0.25);

        return Math.max(100, estimatedCapacity);
    }

    /**
     * Allocate data to images based on their capacities
     * @private
     */
    allocateDataToImages(data, imageCapacities) {
        const chunks = [];
        const chunkId = ChunkManager.generateId();

        let offset = 0;
        let chunkIndex = 0;

        for (const imageInfo of imageCapacities) {
            if (offset >= data.length) break;

            const safeCapacity = Math.floor(imageInfo.capacity * 0.8);
            const chunkSize = Math.min(safeCapacity, data.length - offset);

            if (chunkSize < 10) {
                console.warn(`Image ${imageInfo.file.name} has very low capacity (${imageInfo.capacity} bytes), skipping`);
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
