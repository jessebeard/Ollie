import { JpegDecoder } from './decoder.js';
import { F5 } from '../information-theory/steganography/f5-syndrome.js';

/**
 * CapacityScanner - Orchestrates steganographic capacity analysis across multiple JPEGs.
 * Supports parallel processing via Worker Pool and deterministic error propagation.
 */
export class CapacityScanner {
    /**
     * Scans a list of files for their steganographic capacity.
     * 
     * @param {File[]|Object[]} files - List of File objects or mocks
     * @param {Object} options - { concurrency, analyzer }
     * @param {Function} onProgress - (current, total, status) callback
     * @returns {Promise<[Object|null, Error|null]>} Result tuple
     */
    static async scan(files, options = {}, onProgress = null) {
        if (!files || files.length === 0) {
            return [{ totalCapacity: 0, imageCount: 0, fileCapacities: new Map() }, null];
        }

        const concurrency = options.concurrency || 1;
        let analyzer = options.analyzer;
        
        // Default analyzer: Decodes JPEG and calculates F5 capacity
        if (!analyzer) {
            analyzer = async (file) => {
                const decoder = new JpegDecoder();
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                
                const [info, err] = await decoder.decode(bytes, { coefficientsOnly: true });
                if (err) return [null, err];

                let totalBlocks = 0;
                for (const compId in info.coefficients) {
                    totalBlocks += info.coefficients[compId].blocks.length;
                }

                // Pre-allocate array to avoid reallocation overhead
                const allBlocks = new Array(totalBlocks);
                let blockIndex = 0;

                for (const compId in info.coefficients) {
                    const comp = info.coefficients[compId];
                    for (let i = 0; i < comp.blocks.length; i++) {
                        allBlocks[blockIndex++] = comp.blocks[i];
                    }
                }

                const capacity = F5.calculateCapacity(allBlocks, options.f5Options || {});
                return [capacity, null];
            };
        }

        const total = files.length;
        let completed = 0;
        let totalCapacity = 0;
        const fileCapacities = new Map();
        
        // Result tracking
        let firstError = null;

        /**
         * Task executor for the worker pool
         */
        const processFile = async (file) => {
            if (firstError) return;

            // Defensive: Ensure it looks like a JPEG at the byte level before deep analysis
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            
            if (bytes.length < 2 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
                firstError = new Error(`Invalid JPEG signature for ${file.name}`);
                return;
            }

            // Call analyzer (either mock or real worker-shim)
            const [capacity, err] = await analyzer(file);
            if (err) {
                firstError = err;
                return;
            }

            fileCapacities.set(file.name, capacity);
            totalCapacity += capacity;
            completed++;

            if (onProgress) {
                onProgress(completed, total, `Analyzed ${file.name}`);
            }
        };

        // Parallel execution pool
        const queue = [...files];
        const workers = [];

        const workerLoop = async () => {
            while (queue.length > 0 && !firstError) {
                const file = queue.shift();
                await processFile(file);
            }
        };

        for (let i = 0; i < Math.min(concurrency, files.length); i++) {
            workers.push(workerLoop());
        }

        await Promise.all(workers);

        if (firstError) {
            return [null, firstError];
        }

        return [{
            totalCapacity,
            imageCount: completed,
            fileCapacities
        }, null];
    }
}
