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

                const result = await decoder.decode(jpegBytes, { password });

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
            throw new Error('No valid chunks found in provided images.');
        }

        const sorted = [...chunks].sort((a, b) => a.index - b.index);

        if (sorted.length > 0) { // Only perform this check if there are chunks
            const expectedTotal = sorted[0].total;
            if (sorted.length !== expectedTotal) {
                const presentIndices = new Set(sorted.map(c => c.index));
                const missingIndices = [];
                for (let i = 0; i < expectedTotal; i++) {
                    if (!presentIndices.has(i)) missingIndices.push(i);
                }

                const msg = `Missing chunks: expected ${expectedTotal}, got ${sorted.length} chunks from ${imageFiles.length} input files. Missing indices: [${missingIndices.join(', ')}]`;
                console.error(msg);
                throw new Error(msg);
            }
        }

        if (onProgress) {
            onProgress(total, total, 'Reassembling...');
        }

        const reassembled = ChunkManager.reassemble(chunks);

        return {
            data: reassembled,
            filename: firstMetadata ? firstMetadata.filename : 'unknown',
            metadata: firstMetadata
        };
    }
}
