import { ChunkManager } from './chunk-manager.js';
import { JpegTranscoder } from '../../codec/transcoder.js';
import { JpegDecoder } from '../../codec/decoder.js';
import { JpegEncoder } from '../../codec/encoder.js';
import { F5 } from './f5-syndrome.js';
import { Encryption } from '../cryptography/aes-gcm.js';
import { KeyDerivation } from '../cryptography/pbkdf2.js';

/**
 * BatchEmbedder - Handles embedding data across multiple images
 */
export class BatchEmbedder {
    constructor() {
        this.chunkManager = new ChunkManager();
    }

    /**
     * Embed data into multiple images
     * 
     * @param {Uint8Array} data - Secret data to embed
     * @param {Array<File|Blob>} imageFiles - Input images
     * @param {Object} options - { password, filename, ecc, eccProfile }
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Array<{name: string, data: Uint8Array}>>} Array of output files
     */
    async embed(data, imageFiles, options = {}, onProgress = null) {
        let payloadToEmbed = data;
        let batchEncrypted = false;

        // Perform batch encryption if password is provided
        if (options.password) {
            if (onProgress) onProgress(0, imageFiles.length, 'Encrypting data...');

            const [salt, saltErr] = KeyDerivation.generateSalt();
            if (saltErr) return [null, saltErr];

            const [key, keyErr] = await KeyDerivation.deriveKey(options.password, salt);
            if (keyErr) return [null, keyErr];

            const [encResult, encErr] = await Encryption.encrypt(data, key);
            if (encErr) return [null, encErr];

            const { ciphertext, iv } = encResult;

            // Batch payload structure: [Salt:16][IV:12][Ciphertext:N]
            const encryptedBatch = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
            encryptedBatch.set(salt, 0);
            encryptedBatch.set(iv, salt.length);
            encryptedBatch.set(new Uint8Array(ciphertext), salt.length + iv.length);

            payloadToEmbed = encryptedBatch;
            batchEncrypted = true;
            console.log(`Data encrypted at batch level. Total size: ${payloadToEmbed.length} bytes`);
        }

        if (onProgress) onProgress(0, imageFiles.length, 'Normalizing images...');

        // 1. Analyze Capacities & Prep Images
        const imageInfoList = [];
        let totalCapacity = 0;

        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            const arrayBuffer = await file.arrayBuffer();
            const jpegBytes = new Uint8Array(arrayBuffer);

            const decoder = new JpegDecoder();
            const [decoded, decodeErr] = await decoder.decode(jpegBytes, { coefficientsOnly: true });

            if (decodeErr) {
                console.warn(`Skipping image ${file.name}: ${decodeErr.message}`);
                continue;
            }

            const capacity = F5.calculateCapacity(decoded.coefficients, {
                ecc: options.ecc !== false,
                eccProfile: options.eccProfile || 'Medium'
            });

            imageInfoList.push({
                name: file.name,
                jpegBytes,
                capacity
            });
            totalCapacity += capacity;
        }

        if (imageInfoList.length === 0) {
            return [null, new Error('No valid images found for embedding.')];
        }

        const imageCapacities = imageInfoList.map(info => info.capacity);
        if (payloadToEmbed.length > totalCapacity) {
            return [null, new Error(
                `Insufficient capacity! Data: ${payloadToEmbed.length} bytes, Available: ${totalCapacity} bytes. ` +
                `Need ${Math.ceil((payloadToEmbed.length - totalCapacity) / 1000)} KB more capacity.`
            )];
        }

        const [chunks, allocErr] = this.allocateDataToImages(payloadToEmbed, imageCapacities);
        if (allocErr) return [null, allocErr];

        const results = [];
        const transcoder = new JpegTranscoder();

        for (let i = 0; i < chunks.length; i++) {
            const chunkData = chunks[i];
            const imageInfo = imageInfoList[i];

            if (onProgress) {
                onProgress(i + 1, chunks.length, `Embedding into ${imageInfo.name}...`);
            }

            try {
                const chunkMeta = {
                    id: this.chunkManager.getGroupId(),
                    index: i,
                    total: chunks.length
                };

                const metadata = {
                    filename: options.filename || 'unknown',
                    chunk: chunkMeta,
                    checksum: ChunkManager.calculateChecksum(chunkData),
                    ecc: options.ecc !== false,
                    eccProfile: options.eccProfile || 'Medium',
                    batchEncrypted: batchEncrypted
                };

                const [encodedBytes, transErr] = await transcoder.updateSecret(imageInfo.jpegBytes, chunkData, {
                    metadata: metadata,
                    seed: options.password
                });

                if (transErr) {
                    console.error(`Failed to transcode ${imageInfo.name}:`, transErr);
                    return [null, transErr];
                }

                results.push({
                    name: `steg_${i}_${imageInfo.name}`,
                    data: encodedBytes
                });

            } catch (err) {
                console.error(`Error processing image ${imageInfo.name}:`, err);
                return [null, err];
            }
        }

        return [results, null];
    }

    /**
     * Slices the payload into chunks matching the capacities of provided images
     */
    allocateDataToImages(data, imageCapacities) {
        const chunks = [];
        let offset = 0;

        for (const cap of imageCapacities) {
            if (offset >= data.length) break;

            const chunkSize = Math.min(cap, data.length - offset);
            chunks.push(data.slice(offset, offset + chunkSize));
            offset += chunkSize;
        }

        if (offset < data.length) {
            return [null, new Error('Allocation failed: Data remains after filling all image capacities.')];
        }

        return [chunks, null];
    }
}
