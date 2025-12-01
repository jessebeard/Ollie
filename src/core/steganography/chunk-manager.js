/**
 * ChunkManager - Handles splitting large data into chunks and reassembling them
 */
export class ChunkManager {
    /**
     * Splits data into chunks of specified size
     * 
     * @param {Uint8Array} data - Data to split
     * @param {number} chunkSize - Maximum size of each chunk in bytes
     * @returns {Array<Object>} Array of chunk objects
     */
    static split(data, chunkSize) {
        const chunks = [];
        const chunkId = this.generateId();
        const totalChunks = Math.ceil(data.length / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, data.length);
            const chunkData = data.slice(start, end);

            chunks.push({
                chunkId: chunkId,
                index: i,
                total: totalChunks,
                data: chunkData,
                checksum: this.calculateChecksum(chunkData)
            });
        }

        return chunks;
    }

    /**
     * Reassembles chunks back into original data
     * 
     * @param {Array<Object>} chunks - Array of chunk objects
     * @returns {Uint8Array} Reassembled data
     */
    static reassemble(chunks) {
        if (!chunks || chunks.length === 0) {
            throw new Error('No chunks provided');
        }

        // Validate all chunks have the same chunkId
        const chunkId = chunks[0].chunkId;
        for (const chunk of chunks) {
            if (chunk.chunkId !== chunkId) {
                throw new Error('Chunk IDs do not match - chunks from different datasets');
            }
        }

        // Sort chunks by index
        const sorted = [...chunks].sort((a, b) => a.index - b.index);

        // Validate we have all chunks
        const expectedTotal = sorted[0].total;
        if (sorted.length !== expectedTotal) {
            throw new Error(`Missing chunks: expected ${expectedTotal}, got ${sorted.length}`);
        }

        // Validate indices are sequential
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].index !== i) {
                throw new Error(`Missing chunk at index ${i}`);
            }
        }

        // Calculate total size
        let totalSize = 0;
        for (const chunk of sorted) {
            totalSize += chunk.data.length;
        }

        // Allocate buffer
        const result = new Uint8Array(totalSize);

        // Copy chunks in order
        let offset = 0;
        for (const chunk of sorted) {
            result.set(chunk.data, offset);
            offset += chunk.data.length;
        }

        return result;
    }

    /**
     * Generates a unique ID for a chunk set
     * 
     * @returns {string} UUID-like string
     */
    static generateId() {
        // Simple UUID v4-like generator
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Calculates a simple checksum for data
     * 
     * @param {Uint8Array} data 
     * @returns {number} Checksum value
     */
    static calculateChecksum(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum = (sum + data[i]) & 0xFFFFFFFF;
        }
        return sum;
    }
}
