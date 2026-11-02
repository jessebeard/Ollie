import { describe, it, expect } from '../../utils/test-runner.js';
import {
    packFramedPayload,
    unpackFramedPayload,
    selectBucketSize,
    COMPRESSED_FLAG
} from '../../../src/information-theory/steganography/opaque-container.js';

describe('Format v4.1 Incompressible Deflate Prevention (Bit-31 Flag)', () => {
    it('defines COMPRESSED_FLAG as 0x80000000', () => {
        expect(COMPRESSED_FLAG).toBe(0x80000000 >>> 0);
    });

    it('sets Bit-31 on compressible plaintext and unpacks losslessly', async () => {
        const compressible = new Uint8Array(1000).fill(65); // 1000 'A's compress to ~20 bytes
        const bucketSize = 256;
        const [framed, packErr] = await packFramedPayload(compressible, bucketSize);
        expect(packErr).toBe(null);
        expect(framed.length).toBe(bucketSize);

        const view = new DataView(framed.buffer, framed.byteOffset, framed.byteLength);
        const headerVal = view.getUint32(0, false);
        const isCompressed = (headerVal & COMPRESSED_FLAG) !== 0;
        expect(isCompressed).toBe(true);

        const storedLen = headerVal & 0x7FFFFFFF;
        expect(storedLen < compressible.length).toBe(true);

        const [unpacked, unpackErr] = await unpackFramedPayload(framed);
        expect(unpackErr).toBe(null);
        expect(Array.from(unpacked)).toEqual(Array.from(compressible));
    });

    it('clears Bit-31 on incompressible high-entropy data, storing raw without expansion', async () => {
        // High-entropy random payload (simulating already-encrypted Layer 5 Cauchy MDS stripes)
        const incompressible = new Uint8Array(500);
        // Fill with true cryptographically secure random bytes
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(incompressible);
        } else {
            const { webcrypto } = await import('node:crypto');
            webcrypto.getRandomValues(incompressible);
        }

        const bucketSize = 512;
        const [framed, packErr] = await packFramedPayload(incompressible, bucketSize);
        expect(packErr).toBe(null);
        expect(framed.length).toBe(bucketSize);

        const view = new DataView(framed.buffer, framed.byteOffset, framed.byteLength);
        const headerVal = view.getUint32(0, false);
        const isCompressed = (headerVal & COMPRESSED_FLAG) !== 0;
        // Should bypass Deflate since Deflate adds stored-block overhead to incompressible data
        expect(isCompressed).toBe(false);

        const storedLen = headerVal & 0x7FFFFFFF;
        expect(storedLen).toBe(incompressible.length);

        const [unpacked, unpackErr] = await unpackFramedPayload(framed);
        expect(unpackErr).toBe(null);
        expect(Array.from(unpacked)).toEqual(Array.from(incompressible));
    });

    it('prevents 4092-byte incompressible chunk from spilling into 8192 bucket', async () => {
        const payload = new Uint8Array(4092); // exactly 4092 + 4 = 4096 bytes
        for (let i = 0; i < payload.length; i++) payload[i] = (i * 251) & 0xFF;

        const selectedBucket = selectBucketSize(payload.length);
        expect(selectedBucket).toBe(4096);

        const [framed, packErr] = await packFramedPayload(payload, 4096);
        expect(packErr).toBe(null);
        expect(framed.length).toBe(4096);

        const [unpacked, unpackErr] = await unpackFramedPayload(framed);
        expect(unpackErr).toBe(null);
        expect(unpacked.length).toBe(4092);
    });

    it('strictly fails closed when framed length exceeds buffer boundary', async () => {
        const corrupted = new Uint8Array(64);
        const view = new DataView(corrupted.buffer);
        view.setUint32(0, 1000, false); // claims 1000 bytes in 64 byte buffer

        const [unpacked, err] = await unpackFramedPayload(corrupted);
        expect(unpacked).toBe(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message).toContain('corrupted');
    });
});
