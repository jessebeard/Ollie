import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import {
    serializePayloadV41,
    parseStegoPayload
} from '../../src/information-theory/steganography/stego-payload.js';
import { crc32 } from '../../src/utils/crc32.js';
import { bytesToBase64 } from '../../src/utils/encoding.js';

describe('Format v4.1 Stego-Payload PBT Suite (Rule 11 & 16)', () => {
    it('Property: Arbitrary chunk bytes and metadata roundtrip losslessly through v4.1 binary slice framing', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 1024), Arbitrary.integer(0, 10), Arbitrary.integer(1, 20)],
            (rawBytes, chunkIdx, totalChunks) => {
                const metadata = {
                    filename: `pbt-file-${chunkIdx}.dat`,
                    chunk: { id: `chunk-${chunkIdx}`, index: chunkIdx, total: totalChunks, count: 1, stripeSize: rawBytes.length, startIndex: chunkIdx },
                    checksum: crc32(rawBytes),
                    manifest: {
                        format: 'ollie-manifest',
                        version: 1,
                        chunkSetId: 'pbt-set',
                        total: totalChunks,
                        revision: 1,
                        created: Date.now(),
                        entries: [{ index: chunkIdx, checksum: crc32(rawBytes) }]
                    }
                };

                const [serialized, serErr] = serializePayloadV41(rawBytes, metadata);
                expect(serErr).toBe(null);
                expect(serialized instanceof Uint8Array).toBe(true);

                const [parsed, parseErr] = parseStegoPayload(serialized);
                expect(parseErr).toBe(null);
                expect(parsed !== null).toBe(true);
                expect(Array.from(parsed.secretData)).toEqual(Array.from(rawBytes));
                expect(parsed.secretMetadata.chunk.id).toBe(`chunk-${chunkIdx}`);
                expect(parsed.secretMetadata.chunk.index).toBe(chunkIdx);
            },
            30
        );
    });

    it('Property: v4.1 binary frame is universally smaller than legacy Base64 JSON object for non-trivial chunks', async () => {
        await assertProperty(
            [Arbitrary.byteArray(64, 1024), Arbitrary.integer(0, 5)],
            (rawBytes, chunkIdx) => {
                const metadata = {
                    filename: 'test.dat',
                    chunk: { id: 'c1', index: chunkIdx, total: 5, count: 1, stripeSize: rawBytes.length },
                    checksum: crc32(rawBytes)
                };

                const legacyBytes = new TextEncoder().encode(JSON.stringify({
                    data: bytesToBase64(rawBytes),
                    metadata
                }));

                const [v41Bytes, v41Err] = serializePayloadV41(rawBytes, metadata);
                expect(v41Err).toBe(null);

                // Invariant: v4.1 binary slice frame MUST be strictly smaller than legacy Base64 object
                expect(v41Bytes.length < legacyBytes.length).toBe(true);
            },
            30
        );
    });

    it('Property: Bit tampering in serialized payload fails closed with Result tuple error', async () => {
        await assertProperty(
            [Arbitrary.byteArray(10, 200), Arbitrary.integer(0, 100)],
            (rawBytes, corruptSeed) => {
                const metadata = {
                    filename: 'tamper.dat',
                    chunk: { id: 'c-tamper', index: 0, total: 1, count: 1, stripeSize: rawBytes.length },
                    checksum: crc32(rawBytes)
                };

                const [serialized] = serializePayloadV41(rawBytes, metadata);
                const tampered = new Uint8Array(serialized);

                // Tamper with random position
                const pos = corruptSeed % tampered.length;
                tampered[pos] ^= 0x55;

                const [parsed, err] = parseStegoPayload(tampered);
                // When tampered, parsing must either fail closed or detect checksum mismatch
                if (err !== null) {
                    expect(parsed).toBe(null);
                    expect(err instanceof Error).toBe(true);
                } else {
                    // If parsing structurally succeeded (e.g. corruption in unused metadata field),
                    // then checksum must still match
                    expect(crc32(parsed.secretData)).toBe(parsed.secretMetadata.checksum);
                }
            },
            30
        );
    });
});
