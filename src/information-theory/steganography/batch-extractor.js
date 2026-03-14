import { ChunkManager } from './chunk-manager.js';
import { JpegDecoder } from '../../codec/decoder.js';
import { Encryption } from '../cryptography/aes-gcm.js';
import { KeyDerivation } from '../cryptography/pbkdf2.js';

/**
 * BatchExtractor - Handles extracting and reassembling data from multiple images
 */
export class BatchExtractor {
    /**
     * Extract data from multiple images
     * 
     * @param {Array<File|Blob>} imageFiles - Input images
     * @param {string} password - Master password
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<{data: Uint8Array, filename: string, metadata: any}>}
     */
    async extract(imageFiles, password = null, onProgress = null) {
        const chunks = [];
        let firstMetadata = null;

        for (let i = 0; i < imageFiles.length; i++) {
            if (onProgress) onProgress(i, imageFiles.length, `Extracting from ${imageFiles[i].name || 'image ' + i}...`);

            try {
                const file = imageFiles[i];
                const arrayBuffer = await file.arrayBuffer();
                const jpegBytes = new Uint8Array(arrayBuffer);
                const decoder = new JpegDecoder();

                // Pass seed for permutation, but NOT password for individual decryption
                // unless we want to support legacy mode here? 
                // Let's pass password but add a flag to decode to NOT fail if decryption fails 
                // or just try with seed first.
                const [result, err] = await decoder.decode(jpegBytes, { seed: password });
                if (err) throw err;

                if (result.secretData) {
                    const chunkMeta = result.secretMetadata?.chunk;
                    if (chunkMeta && typeof chunkMeta.index === 'number') {
                        chunks.push({
                            chunkId: chunkMeta.id,
                            index: chunkMeta.index,
                            total: chunkMeta.total,
                            data: result.secretData,
                            checksum: result.secretMetadata.checksum,
                            metadata: result.secretMetadata
                        });

                        if (!firstMetadata) {
                            firstMetadata = result.secretMetadata;
                        }
                    }
                }
            } catch (e) {
                console.warn(`Failed to process image ${i}:`, e.message);
            }
        }

        if (chunks.length === 0) {
            return [null, null];
        }

        // 2. Identify full groups
        // Multiple groups could exist if user drops images from different batches.
        // For now, we take the group of the first valid chunk.
        const targetGroupId = chunks[0].chunkId;
        const groupChunks = chunks.filter(c => c.chunkId === targetGroupId);

        if (groupChunks.length === 0) return [null, new Error('No valid chunks for target group')];

        const totalExpected = groupChunks[0].total;
        const completeGroup = new Array(totalExpected).fill(null);

        for (const c of groupChunks) {
            completeGroup[c.index] = c;
        }

        if (completeGroup.includes(null)) {
            const missing = completeGroup.map((c, i) => c === null ? i : null).filter(i => i !== null);
            return [null, new Error(`Incomplete data: Missing chunks ${missing.join(', ')} of ${totalExpected}`)];
        }

        // 3. Reassemble
        const [reassembled, reassembleErr] = ChunkManager.reassemble(completeGroup);
        if (reassembleErr) {
            console.warn(`[BatchExtractor] Failed to reassemble chunks: ${reassembleErr.message}`);
            return [null, reassembleErr];
        }

        let finalData = reassembled;
        const firstChunkMeta = completeGroup[0].metadata || {};

        if (firstChunkMeta.batchEncrypted && password) {
            console.log('Decrypting batch-encrypted payload...');
            
            // Batch payload structure: [Salt:16][IV:12][Ciphertext:N]
            const salt = reassembled.slice(0, 16);
            const iv = reassembled.slice(16, 28);
            const ciphertext = reassembled.slice(28);

            const [key, keyErr] = await KeyDerivation.deriveKey(password, salt);
            if (keyErr) return [null, keyErr];

            const [decrypted, decryptErr] = await Encryption.decrypt(ciphertext, key, iv);
            if (decryptErr) return [null, decryptErr];

            finalData = decrypted;
        }

        return [{
            data: finalData,
            filename: firstChunkMeta.filename || 'unknown',
            metadata: { chunk: completeGroup[0] }
        }, null];
    }
}
