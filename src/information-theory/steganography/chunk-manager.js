import { cryptoInstance } from "../cryptography/crypto-compat.js";
/**
 * ChunkManager - Handles splitting large data into chunks and reassembling them
 */
export class ChunkManager {
    /**
     * Splits data into chunks of specified size
     * 
     * @param {Uint8Array} data - Data to split
     * @param {number} chunkSize - Maximum size of each chunk in bytes
     * @param {string} [chunkId] - Injected ID for deterministic testing
     * @returns {Array<Object>} Array of chunk objects
     */
    static split(data, chunkSize, chunkId = null) {
        const chunks = [];
        const id = chunkId || ChunkManager.generateId();
        const totalChunks = Math.ceil(data.length / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, data.length);
            const chunkData = data.slice(start, end);

            chunks.push({
                chunkId: id,
                index: i,
                total: totalChunks,
                data: chunkData,
                checksum: ChunkManager.calculateChecksum(chunkData)
            });
        }

        return chunks;
    }

    /**
     * Reassembles chunks back into original data
     * 
     * @param {Array<Object>} chunks - Array of chunk objects
     * @returns {[Uint8Array|null, Error|null]} Tuple of [reassembledData, error]
     */
    static reassemble(chunks) {
        if (!chunks || chunks.length === 0) {
            return [null, new Error('No chunks provided')];
        }

        const chunkId = chunks[0].chunkId;
        for (const chunk of chunks) {
            if (chunk.chunkId !== chunkId) {
                return [null, new Error('Chunk IDs do not match - chunks from different datasets')];
            }
        }

        const sorted = [...chunks].sort((a, b) => a.index - b.index);

        const expectedTotal = sorted[0].total;
        if (sorted.length !== expectedTotal) {
            return [null, new Error(`Missing chunks: expected ${expectedTotal}, got ${sorted.length}`)];
        }

        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].index !== i) {
                return [null, new Error(`Missing chunk at index ${i}`)];
            }
        }

        let totalSize = 0;
        for (const chunk of sorted) {
            totalSize += chunk.data.length;
        }

        const result = new Uint8Array(totalSize);

        let offset = 0;
        for (const chunk of sorted) {
            result.set(chunk.data, offset);
            offset += chunk.data.length;
        }

        return [result, null];
    }

    /**
     * Generates a unique ID for a chunk set
     * 
     * @returns {string} UUID-like string
     */
    static generateId() {
        // 🛡️ Sentinel: Mitigate unpredictable ID generation vulnerabilities by using cryptographically secure random values
        return cryptoInstance.randomUUID();
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
