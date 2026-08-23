import { JpegDecoder } from './decoder.js';
import { BatchEmbedder } from '../information-theory/steganography/batch-embedder.js';

/**
 * CapacityScanner - Orchestrates steganographic capacity analysis across multiple JPEGs.
 * Concurrency is cooperative (async tasks on the main thread, `options.concurrency`);
 * no Worker threads are involved. Deterministic error propagation throughout.
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
        
        // Default analyzer: Decodes JPEG and calculates capacity via the
        // embedder's own container-mode math (single source of truth)
        if (!analyzer) {
            const { format, metadata, ...capacityOpts } = options.f5Options || {};
            analyzer = async (file) => {
                const decoder = new JpegDecoder();
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                const [info, err] = await decoder.decode(bytes, { skipExtraction: true, coefficientsOnly: true });
                if (err) return [null, err];

                const allBlocks = [];
                for (const compId in info.coefficients) {
                    const comp = info.coefficients[compId];
                    for (let i = 0; i < comp.blocks.length; i++) {
                        allBlocks.push(comp.blocks[i]);
                    }
                }

                const capacity = BatchEmbedder.calculateCarrierCapacity(allBlocks, capacityOpts, metadata);
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
         * Processes a single file (decode + capacity math)
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

            // Run the analyzer (injected mock or the default decoder-based one)
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

        // Cooperative async pool: N concurrent loops draining a shared queue
        const queue = [...files];
        const loops = [];

        const drainQueue = async () => {
            while (queue.length > 0 && !firstError) {
                const file = queue.shift();
                await processFile(file);
            }
        };

        for (let i = 0; i < Math.min(concurrency, files.length); i++) {
            loops.push(drainQueue());
        }

        await Promise.all(loops);

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
