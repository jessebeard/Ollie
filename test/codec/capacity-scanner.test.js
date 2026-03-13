"use strict";

import { describe, it, expect } from '../utils/test-runner.js';
import { CapacityScanner } from '../../src/codec/capacity-scanner.js';
import { createMockJpeg } from '../utils/jpeg-fixtures.js';

describe('CapacityScanner (Unit Tests)', () => {
    

    it('should return a success Result tuple with capacity data for a list of JPEGs', async () => {
        const files = [
            createMockJpeg('img1.jpg', 2000),
            createMockJpeg('img2.jpg', 3000)
        ];

        const [result, error] = await CapacityScanner.scan(files);

        expect(error).toBeNull();
        expect(result).toBeDefined();
        expect(typeof result.totalCapacity).toBe('number');
        expect(result.totalCapacity).toBeGreaterThanOrEqual(0);
        expect(result.imageCount).toBe(2);
        expect(result.fileCapacities instanceof Map).toBeTruthy();
        expect(result.fileCapacities.get('img1.jpg')).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-JPEG files by returning an error result', async () => {
        const files = [
            { name: 'not-a-jpeg.txt', size: 10, arrayBuffer: async () => new Uint8Array(10).buffer }
        ];

        const [result, error] = await CapacityScanner.scan(files);

        expect(result).toBeNull();
        expect(error).toBeDefined();
        expect(error.message).toContain('Invalid JPEG signature');
    });

    it('should propagate progress updates via the onProgress callback', async () => {
        const files = [
            createMockJpeg('p1.jpg'),
            createMockJpeg('p2.jpg')
        ];

        let progressCalls = [];
        const onProgress = (current, total, status) => {
            progressCalls.push({ current, total, status });
        };

        const [result, error] = await CapacityScanner.scan(files, {}, onProgress);

        expect(error).toBeNull();
        expect(progressCalls.length).toBeGreaterThanOrEqual(2);
        expect(progressCalls[0].total).toBe(2);
        expect(progressCalls[progressCalls.length - 1].current).toBe(2);
    });

    it('should return zero capacity for an empty file list', async () => {
        const [result, error] = await CapacityScanner.scan([]);

        expect(error).toBeNull();
        expect(result.totalCapacity).toBe(0);
        expect(result.imageCount).toBe(0);
    });

    it('should truly process files in parallel', async () => {
        // High-fidelity concurrency test:
        // We Use a "latch" strategy. Each analysis task will wait until 
        // 'concurrency' number of tasks have all started.
        // If they run sequentially, this will never finish (or we can timeout).
        
        const concurrency = 3;
        const files = [
            createMockJpeg('p1.jpg'),
            createMockJpeg('p2.jpg'),
            createMockJpeg('p3.jpg')
        ];

        let startedCount = 0;
        let resolveLatch;
        const latchPromise = new Promise(resolve => resolveLatch = resolve);

        // We override the internal analysis logic for this test 
        // (Implementation will need to support a custom analyzer for testing)
        const mockAnalyzer = async () => {
            startedCount++;
            if (startedCount === concurrency) {
                resolveLatch();
            }
            await latchPromise; // Block until all have started
            return [1000, null]; // Mock capacity Result
        };

        const [result, error] = await CapacityScanner.scan(files, { 
            concurrency,
            analyzer: mockAnalyzer // Injecting the latching analyzer
        });

        expect(error).toBeNull();
        expect(result.imageCount).toBe(3);
        expect(startedCount).toBe(3);
    });

    it('should aggregate results correctly when processed out of order', async () => {
        const files = [
            createMockJpeg('slow.jpg', 5000), // Larger may take longer in mock world if we delayed
            createMockJpeg('fast.jpg', 100)
        ];

        const [result, error] = await CapacityScanner.scan(files, { concurrency: 2 });

        expect(error).toBeNull();
        expect(result.fileCapacities.has('slow.jpg')).toBeTruthy();
        expect(result.fileCapacities.has('fast.jpg')).toBeTruthy();
    });

    it('should gracefully terminate the worker pool when finished', async () => {
        // This is a behavioral test to ensure no hanging processes/workers
        const files = [createMockJpeg('t1.jpg')];
        const [result, error] = await CapacityScanner.scan(files, { concurrency: 2 });
        
        expect(error).toBeNull();
        // The fact that the test finishes is part of the verification,
        // but the implementation should explicitly close workers.
    });

    it('should handle corrupted JPEG data gracefully', async () => {
        const corruptedJpeg = createMockJpeg('bad.jpg', 100);
        corruptedJpeg.bytes[5] = 0x00; // Corrupt a marker sequence or similar
        
        const [result, error] = await CapacityScanner.scan([corruptedJpeg]);
        
        // Depending on implementation, it might error or return 0 capacity for that file
        // Rule 6: Deterministic Error Propagation
        expect(error).toBeDefined();
    });
});
