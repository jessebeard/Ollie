import { describe, it, expect } from '../../utils/test-runner.js';
import {
    serializePayloadV41,
    parseStegoPayload,
    STEGO_PAYLOAD_V41_VERSION
} from '../../../src/information-theory/steganography/stego-payload.js';
import { crc32 } from '../../../src/utils/crc32.js';
import { bytesToBase64 } from '../../../src/utils/encoding.js';

describe('Format v4.1 Stego-Payload & Strong Parser (Rule 16)', () => {
    const SAMPLE_RAW_DATA = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const SAMPLE_METADATA = {
        filename: 'vault.json',
        chunk: { id: 'chunk-1234', index: 0, total: 3, count: 1, stripeSize: 14, startIndex: 0 },
        checksum: crc32(SAMPLE_RAW_DATA),
        manifest: {
            format: 'ollie-manifest',
            version: 1,
            chunkSetId: 'set-abcd',
            total: 3,
            revision: 1,
            created: 1700000000000,
            entries: [{ index: 0, checksum: crc32(SAMPLE_RAW_DATA) }],
            shares: [{ index: 1, threshold: 2, data: '01020304' }]
        }
    };

    it('serializes into Binary Slice Framing starting with version 41', () => {
        const [serialized, err] = serializePayloadV41(SAMPLE_RAW_DATA, SAMPLE_METADATA);
        expect(err).toBe(null);
        expect(serialized instanceof Uint8Array).toBe(true);

        const view = new DataView(serialized.buffer, serialized.byteOffset, serialized.byteLength);
        expect(view.getUint8(0)).toBe(STEGO_PAYLOAD_V41_VERSION);
        expect(view.getUint8(0)).toBe(41);

        const checksum = view.getUint32(1, false);
        expect(checksum).toBe(crc32(SAMPLE_RAW_DATA));

        const metaLen = view.getUint16(5, false);
        expect(metaLen > 0).toBe(true);
        expect(7 + metaLen + SAMPLE_RAW_DATA.length).toBe(serialized.length);
    });

    it('roundtrips data and metadata losslessly through serialize and parse', () => {
        const [serialized, serErr] = serializePayloadV41(SAMPLE_RAW_DATA, SAMPLE_METADATA);
        expect(serErr).toBe(null);

        const [parsed, parseErr] = parseStegoPayload(serialized);
        expect(parseErr).toBe(null);
        expect(parsed !== null).toBe(true);
        expect(Array.from(parsed.secretData)).toEqual(Array.from(SAMPLE_RAW_DATA));
        expect(parsed.secretMetadata.chunk.id).toBe(SAMPLE_METADATA.chunk.id);
        expect(parsed.secretMetadata.chunk.index).toBe(0);
        expect(parsed.secretMetadata.manifest.chunkSetId).toBe('set-abcd');
    });

    it('serializes metadata as pure positional tuples with zero labeled JSON dictionary keys', () => {
        const [serialized, serErr] = serializePayloadV41(SAMPLE_RAW_DATA, SAMPLE_METADATA);
        expect(serErr).toBe(null);

        const view = new DataView(serialized.buffer, serialized.byteOffset, serialized.byteLength);
        const metaLen = view.getUint16(5, false);
        const metaBytes = serialized.subarray(7, 7 + metaLen);
        const metaString = new TextDecoder().decode(metaBytes);

        // Verify zero labeled JSON keys
        expect(metaString.includes('"chunk"')).toBe(false);
        expect(metaString.includes('"manifest"')).toBe(false);
        expect(metaString.includes('"format"')).toBe(false);
        expect(metaString.includes('"chunkSetId"')).toBe(false);
        expect(metaString.includes('"stripeSize"')).toBe(false);

        // Verify that it is valid JSON representing an array
        const parsed = JSON.parse(metaString);
        expect(Array.isArray(parsed)).toBe(true);
        expect(Array.isArray(parsed[0])).toBe(true); // chunk tuple
        expect(Array.isArray(parsed[1])).toBe(true); // manifest tuple
    });

    it('achieves >= 20% byte footprint reduction vs legacy v4.0 JSON Base64 object on 1KB chunks', () => {
        const chunk1KB = new Uint8Array(1024);
        for (let i = 0; i < 1024; i++) chunk1KB[i] = (i * 37) & 0xFF;

        const legacyV40 = new TextEncoder().encode(JSON.stringify({
            data: bytesToBase64(chunk1KB),
            metadata: SAMPLE_METADATA
        }));

        const [v41Bytes, v41Err] = serializePayloadV41(chunk1KB, SAMPLE_METADATA);
        expect(v41Err).toBe(null);

        const reduction = 1 - (v41Bytes.length / legacyV40.length);
        expect(reduction >= 0.20).toBe(true);
    });

    it('strictly fails closed when buffer is shorter than 7-byte header', () => {
        const tooShort = new Uint8Array([41, 0, 1, 2]);
        const [parsed, err] = parseStegoPayload(tooShort);
        expect(parsed).toBe(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message).toContain('header');
    });

    it('strictly fails closed when version is not 41 and not legacy JSON', () => {
        const badVersion = new Uint8Array([99, 0, 0, 0, 1, 0, 5, 123, 125]);
        const [parsed, err] = parseStegoPayload(badVersion);
        expect(parsed).toBe(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message).toContain('version');
    });

    it('strictly fails closed when metaLen exceeds payload boundary', () => {
        const overbound = new Uint8Array(20);
        const view = new DataView(overbound.buffer);
        view.setUint8(0, 41);
        view.setUint16(5, 500); // Claims 500 bytes metadata in a 20-byte buffer

        const [parsed, err] = parseStegoPayload(overbound);
        expect(parsed).toBe(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message).toContain('metaLen');
    });

    it('strictly fails closed when carrierChecksum does not match raw bytes CRC-32', () => {
        const [serialized] = serializePayloadV41(SAMPLE_RAW_DATA, SAMPLE_METADATA);
        const tampered = new Uint8Array(serialized);
        // Tamper with the raw data byte at the end
        tampered[tampered.length - 1] ^= 0xFF;

        const [parsed, err] = parseStegoPayload(tampered);
        expect(parsed).toBe(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message).toContain('checksum');
    });

    it('maintains transparent backward compatibility with legacy v4.0 JSON objects', () => {
        const legacyBytes = new TextEncoder().encode(JSON.stringify({
            data: bytesToBase64(SAMPLE_RAW_DATA),
            metadata: SAMPLE_METADATA
        }));

        const [parsed, err] = parseStegoPayload(legacyBytes);
        expect(err).toBe(null);
        expect(parsed !== null).toBe(true);
        expect(Array.from(parsed.secretData)).toEqual(Array.from(SAMPLE_RAW_DATA));
        expect(parsed.secretMetadata.filename).toBe('vault.json');
    });
});
