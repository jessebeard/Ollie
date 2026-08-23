import { describe, it, expect } from '../utils/test-runner.js';
import { DropZone } from '../../app/components/vault/components/drop-zone.js';

/**
 * Chrome's FileSystemDirectoryReader.readEntries() returns at most 100
 * entries per call and requires repeated calls until an empty batch arrives.
 * These tests pin that pagination contract.
 */
function makePaginatedReader(batchSize) {
    let calls = 0;
    const total = 250;
    return {
        get callCount() { return calls; },
        readEntries(onSuccess, onError) {
            calls++;
            const start = (calls - 1) * batchSize;
            const batch = [];
            for (let i = start; i < Math.min(start + batchSize, total); i++) {
                batch.push({ name: `photo_${i}.jpg`, isFile: true });
            }
            setTimeout(() => onSuccess(batch), 0);
        }
    };
}

describe('DropZone directory pagination', () => {

    it('drains >100-entry directories across multiple readEntries batches', async () => {
        const reader = makePaginatedReader(100);
        const dz = Object.create(DropZone.prototype);

        const entries = await dz.readEntriesPromise(reader);

        expect(entries.length).toBe(250);
        if (reader.callCount < 4) {
            throw new Error(`expected at least 4 readEntries calls for 250 entries in 100-batches, got ${reader.callCount}`);
        }
        expect(entries[0].name).toBe('photo_0.jpg');
        expect(entries[249].name).toBe('photo_249.jpg');
    });

    it('resolves after exactly one extra call when everything fits one batch', async () => {
        const reader = makePaginatedReader(1000);
        reader.readEntries = (() => {
            let calls = 0;
            return (onSuccess) => {
                calls++;
                onSuccess(calls === 1
                    ? Array.from({ length: 50 }, (_, i) => ({ name: `f_${i}.jpg` }))
                    : []);
            };
        })();
        const dz = Object.create(DropZone.prototype);

        const entries = await dz.readEntriesPromise(reader);

        expect(entries.length).toBe(50);
    });
});
