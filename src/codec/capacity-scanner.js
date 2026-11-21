import { getCarrierPool } from './carrier-pool.js';

/**
 * CapacityScanner - Orchestrates steganographic capacity analysis across multiple JPEGs.
 * Supports hardware-parallel execution via WorkerPool with cooperative async queueing
 * and deterministic error propagation throughout.
 */
export class CapacityScanner {
    /**
     * Scans a list of files for their steganographic capacity.
     * 
     * @param {File[]|Object[]} files - List of File objects or mocks
     * @param {Object} options - { concurrency, analyzer, multithreaded }
     * @param {Function} onProgress - (current, total, status) callback
     * @returns {Promise<[Object|null, Error|null]>} Result tuple
     */
    static async scan(files, options = {}, onProgress = null) {
        if (!files || files.length === 0) {
            return [{ totalCapacity: 0, imageCount: 0, fileCapacities: new Map() }, null];
        }

        const pool = getCarrierPool();
        const concurrency = options.concurrency || (pool.maxWorkers || 2);
        let analyzer = options.analyzer;
        
        // Default analyzer: Decodes JPEG and calculates capacity via the
        // embedder's own container-mode math (single source of truth)
        if (!analyzer) {
            const { format, metadata, ...capacityOpts } = options.f5Options || {};
            analyzer = async (file) => {
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                if (options.multithreaded === false) {
                    const [res, err] = await pool.fallbackHandler('scan-capacity', {
                        jpegBytes: bytes,
                        options: capacityOpts,
                        metadata
                    });
                    if (err) return [null, err];
                    return [res.capacity, null];
                }

                // Slice an isolated buffer for worker transfer to protect caller's buffer from detachment
                const payloadBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                const payloadBytes = new Uint8Array(payloadBuffer);

                const [res, err] = await pool.dispatch('scan-capacity', {
                    jpegBytes: payloadBytes,
                    options: capacityOpts,
                    metadata
                }, [payloadBuffer]);

                if (err) return [null, err];
                return [res.capacity, null];
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
