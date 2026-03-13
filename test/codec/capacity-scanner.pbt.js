"use strict";

import { describe, it, expect } from '../utils/test-runner.js';
import { CapacityScanner } from '../../src/codec/capacity-scanner.js';
import { createMockJpeg } from '../utils/jpeg-fixtures.js';

describe('CapacityScanner (Property-Based Tests)', () => {


    it('Property: Total capacity must be invariant under file ordering', async () => {
        const fileA = createMockJpeg('A.jpg', 2000);
        const fileB = createMockJpeg('B.jpg', 3000);
        const fileC = createMockJpeg('C.jpg', 4000);

        const [result1, err1] = await CapacityScanner.scan([fileA, fileB, fileC]);
        const [result2, err2] = await CapacityScanner.scan([fileC, fileA, fileB]);
        const [result3, err3] = await CapacityScanner.scan([fileB, fileC, fileA]);

        expect(err1).toBeNull();
        expect(err2).toBeNull();
        expect(err3).toBeNull();

        expect(result1.totalCapacity).toBe(result2.totalCapacity);
        expect(result1.totalCapacity).toBe(result3.totalCapacity);
        expect(result2.totalCapacity).toBe(result3.totalCapacity);
    });

    it('Property: Total capacity must be invariant under different concurrency levels', async () => {
        const files = Array.from({ length: 10 }, (_, i) => createMockJpeg(`img${i}.jpg`, 1000 + i * 100));

        const [resSequential, errSeq] = await CapacityScanner.scan(files, { concurrency: 1 });
        const [resParallel, errPar] = await CapacityScanner.scan(files, { concurrency: 4 });

        expect(errSeq).toBeNull();
        expect(errPar).toBeNull();

        expect(resSequential.totalCapacity).toBe(resParallel.totalCapacity);
        expect(resSequential.imageCount).toBe(resParallel.imageCount);
    });

    it('Property: Total capacity must always be >= 0', async () => {
        // Test with various random "JPEG" sizes
        const sizes = [100, 500, 1000, 5000, 10000];
        for (const size of sizes) {
            const file = createMockJpeg(`random_${size}.jpg`, size);
            const [result, err] = await CapacityScanner.scan([file]);
            expect(err).toBeNull();
            expect(result.totalCapacity).toBeGreaterThanOrEqual(0);
        }
    });

    it('Property: Image count must match the number of successfully scanned files', async () => {
        const files = [
            createMockJpeg('1.jpg'),
            createMockJpeg('2.jpg'),
            createMockJpeg('3.jpg')
        ];

        const [result, err] = await CapacityScanner.scan(files);
        expect(err).toBeNull();
        expect(result.imageCount).toBe(files.length);
        expect(result.fileCapacities.size).toBe(files.length);
    });
});
