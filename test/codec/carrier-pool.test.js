import { describe, it, expect } from '../utils/test-runner.js';
import { getCarrierPool } from '../../src/codec/carrier-pool.js';
import { createMockJpeg } from '../utils/jpeg-fixtures.js';

describe('CarrierPool (Worker Parallelism)', () => {
    it('dispatches scan-capacity through background worker', async () => {
        const pool = getCarrierPool();
        const mock = createMockJpeg('sample.jpg');
        const buffer = await mock.arrayBuffer();
        const jpegBytes = new Uint8Array(buffer);

        const [res, err] = await pool.dispatch('scan-capacity', {
            jpegBytes,
            options: {},
            metadata: { filename: 'test.json' }
        }, [jpegBytes.buffer]);

        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(typeof res.capacity).toBe('number');
        expect(res.capacity).toBeGreaterThanOrEqual(0);
        expect(typeof res.blockCount).toBe('number');
    });

    it('propagates invalid signature error as [null, Error] tuple', async () => {
        const pool = getCarrierPool();
        const badBytes = new Uint8Array([0x00, 0x11, 0x22, 0x33]);

        const [res, err] = await pool.dispatch('scan-capacity', {
            jpegBytes: badBytes,
            options: {}
        });

        expect(res).toBeNull();
        expect(err instanceof Error).toBe(true);
        expect(err.message.includes('signature') || err.message.includes('SOI') || err.message.includes('JPEG')).toBe(true);
    });

    it('executes via fallback handler when worker concurrency is disabled', async () => {
        const pool = getCarrierPool();
        const mock = createMockJpeg('sample-fallback.jpg');
        const buffer = await mock.arrayBuffer();
        const jpegBytes = new Uint8Array(buffer);

        const [res, err] = await pool.fallbackHandler('scan-capacity', {
            jpegBytes,
            options: {},
            metadata: { filename: 'test.json' }
        });

        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(typeof res.capacity).toBe('number');
        expect(res.capacity).toBeGreaterThanOrEqual(0);
    });
});
