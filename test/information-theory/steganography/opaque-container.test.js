import { describe, it, expect } from '../../utils/test-runner.js';
import {
    selectBucketSize,
    packFramedPayload,
    unpackFramedPayload,
    sealOpaque,
    unsealOpaque,
    SALT_BYTES,
    TAG_BYTES
} from '../../../src/information-theory/steganography/opaque-container.js';

describe('Format v4 Zero-Length Opaque Container', () => {
    const TEST_PASSWORD = 'strong-format-v4-password';
    const TEST_PAYLOAD = new TextEncoder().encode('Confidential Vault Information 12345!@#$%');

    it('selectBucketSize returns appropriate quantized bucket boundary', () => {
        expect(selectBucketSize(10)).toBe(256);
        expect(selectBucketSize(250)).toBe(256);
        expect(selectBucketSize(260)).toBe(512);
        expect(selectBucketSize(1000)).toBe(1024);
        expect(selectBucketSize(5000)).toBe(8192);
    });

    it('packFramedPayload and unpackFramedPayload roundtrip accurately', async () => {
        const bucketSize = 512;
        const [framed, packErr] = await packFramedPayload(TEST_PAYLOAD, bucketSize);
        expect(packErr).toBe(null);
        expect(framed.length).toBe(bucketSize);

        const [recovered, unpackErr] = await unpackFramedPayload(framed);
        expect(unpackErr).toBe(null);
        expect(Array.from(recovered)).toEqual(Array.from(TEST_PAYLOAD));
    });

    it('sealOpaque and unsealOpaque roundtrip payload with exact byte recovery', async () => {
        const kdfOpts = { memorySize: 64, passes: 1 }; // fast test profile
        const [wire, sealErr] = await sealOpaque(TEST_PAYLOAD, TEST_PASSWORD, { bucketSize: 512, kdfOpts });
        expect(sealErr).toBe(null);
        expect(wire.length).toBe(SALT_BYTES + 512 + TAG_BYTES);

        const [unsealed, unsealErr] = await unsealOpaque(wire, TEST_PASSWORD, { kdfOpts });
        expect(unsealErr).toBe(null);
        expect(Array.from(unsealed)).toEqual(Array.from(TEST_PAYLOAD));
    });

    it('unsealOpaque fails cleanly on wrong password or corrupted ciphertext', async () => {
        const kdfOpts = { memorySize: 64, passes: 1 };
        const [wire] = await sealOpaque(TEST_PAYLOAD, TEST_PASSWORD, { bucketSize: 256, kdfOpts });

        // Wrong password
        const [res1, err1] = await unsealOpaque(wire, 'wrong-password', { kdfOpts });
        expect(res1).toBe(null);
        expect(err1 instanceof Error).toBe(true);

        // Tampered ciphertext
        const corrupted = new Uint8Array(wire);
        corrupted[corrupted.length - 1] ^= 0xFF;
        const [res2, err2] = await unsealOpaque(corrupted, TEST_PASSWORD, { kdfOpts });
        expect(res2).toBe(null);
        expect(err2 instanceof Error).toBe(true);
    });

    it('output wire contains zero length indicators in the clear', async () => {
        const kdfOpts = { memorySize: 64, passes: 1 };
        const p1 = new TextEncoder().encode('Short');
        const p2 = new TextEncoder().encode('A much longer payload that still fits into the same standard 512-byte bucket');

        const [w1] = await sealOpaque(p1, TEST_PASSWORD, { bucketSize: 512, kdfOpts });
        const [w2] = await sealOpaque(p2, TEST_PASSWORD, { bucketSize: 512, kdfOpts });

        // Wire sizes are identical regardless of content length!
        expect(w1.length).toBe(w2.length);
        expect(w1.length).toBe(SALT_BYTES + 512 + TAG_BYTES);
    });

    it('handles large bucket padding (> 64KB) without QuotaExceededError', async () => {
        const largeBucket = 131072; // 128 KB
        const smallPayload = new Uint8Array([1, 2, 3, 4, 5]);
        const [framed, packErr] = await packFramedPayload(smallPayload, largeBucket);
        expect(packErr).toBe(null);
        expect(framed.length).toBe(largeBucket);

        const [recovered, unpackErr] = await unpackFramedPayload(framed);
        expect(unpackErr).toBe(null);
        expect(Array.from(recovered)).toEqual(Array.from(smallPayload));
    });
});
