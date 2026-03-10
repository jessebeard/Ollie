import { ChunkManager } from './chunk-manager.js';
import { JpegDecoder } from '../jpeg-decoder.js';

/**
 * BatchExtractor - Handles extracting and reassembling data from multiple images
 */
export class BatchExtractor {
    /**
     * Extracts and reassembles data from multiple images
     * 
     * @param {Array<File>} imageFiles - List of image files
     * @param {string} [password] - Password for decryption
     * @param {Function} [onProgress] - Callback (current, total, status)
     * @returns {Promise<{data: Uint8Array, filename: string, metadata: Object}>}
     */
    async extract(imageFiles, password, onProgress = null) {
        const chunks = [];
        const total = imageFiles.length;
        let firstMetadata = null;

        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            if (onProgress) {
                onProgress(i, total, `Extracting from ${file.name}...`);
            }

            try {
                const arrayBuffer = await file.arrayBuffer();
                const jpegBytes = new Uint8Array(arrayBuffer);
                const decoder = new JpegDecoder();

                const [result, err] = await decoder.decode(jpegBytes, { password });
                if (err) throw err;

                if (result.secretData) {
                    console.log(`File ${file.name}: Found secret data. Metadata:`, result.secretMetadata);
                    if (result.secretMetadata && result.secretMetadata.chunk) {
                        const chunkMeta = result.secretMetadata.chunk;
                        console.log(`File ${file.name}: Valid chunk found. Index ${chunkMeta.index}/${chunkMeta.total}`);

                        chunks.push({
                            chunkId: chunkMeta.id,
                            index: chunkMeta.index,
                            total: chunkMeta.total,
                            data: result.secretData,
                            checksum: result.secretMetadata.checksum
                        });

                        if (!firstMetadata) {
                            firstMetadata = result.secretMetadata;
                        }
                    } else {
                        console.warn(`File ${file.name} has secret data but no chunk metadata. Ignoring.`);
                    }
                } else {
                    console.log(`File ${file.name}: No secret data found.`);
                }
            } catch (error) {
                console.error(`Failed to extract from ${file.name}:`, error);
                if (onProgress) {
                    onProgress(i + 1, total, `Error extracting from ${file.name}`);
                }
            }
        }

        if (chunks.length === 0) {
            return [null, new Error('No valid chunks found in provided images.')];
        }

        // Group chunks by chunkId
        const chunkGroups = new Map();
        for (const chunk of chunks) {
            if (!chunkGroups.has(chunk.chunkId)) {
                chunkGroups.set(chunk.chunkId, []);
            }
            chunkGroups.get(chunk.chunkId).push(chunk);
        }

        // Find a complete group
        let completeGroup = null;
        let bestErrorMsg = 'No complete vault payload found across images.';

        for (const [chunkId, groupChunks] of chunkGroups.entries()) {
            const sorted = [...groupChunks].sort((a, b) => a.index - b.index);
            const expectedTotal = sorted[0].total;

            if (sorted.length !== expectedTotal) {
                const presentIndices = new Set(sorted.map(c => c.index));
                const missingIndices = [];
                for (let i = 0; i < expectedTotal; i++) {
                    if (!presentIndices.has(i)) missingIndices.push(i);
                }
                const msg = `Incomplete chunk set (ID ${chunkId}): expected ${expectedTotal}, got ${sorted.length}. Missing indices: [${missingIndices.join(', ')}]`;
                console.warn(msg);
                bestErrorMsg = msg;
                continue; // Try next group
            }

            // Group is complete
            completeGroup = sorted;
            break;
        }

        if (!completeGroup) {
            console.error(bestErrorMsg);
            return [null, new Error(bestErrorMsg)];
        }

        if (onProgress) {
            onProgress(total, total, 'Reassembling...');
        }

        const [reassembled, reassembleErr] = ChunkManager.reassemble(completeGroup);
        if (reassembleErr) {
            console.warn(`[BatchExtractor] Failed to reassemble chunks: ${reassembleErr.message}`);
            return null; // or perhaps return [null, reassembleErr]
        }

        firstMetadata = chunks.find(c => c.chunkId === completeGroup[0].chunkId);
        // Find the metadata corresponding to the complete group! But wait, `firstMetadata` in the loop was tracking the very first one which might be from a corrupted group.
        // Actually BatchExtractor returns simply { data, filename, metadata}.
        // We can just use the chunk metadata of the successful group.

        return [{
            data: reassembled,
            filename: firstMetadata ? 'vault.json' : 'unknown',
            metadata: { chunk: completeGroup[0] } // Mock or assemble metadata
        }, null];
    }
}
