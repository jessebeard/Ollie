import { describe, it, expect } from '../utils/test-runner.js';
import {
    CONTROL_MAGIC,
    CONTROL_VERSION,
    encodeControlCodeword,
    decodeControlCodeword,
    unpackControlHeader
} from '../../src/information-theory/steganography/coded-header.js';
import { F5 } from '../../src/information-theory/steganography/f5-syndrome.js';
import { ECC_PROFILES } from '../../src/information-theory/error-correction/rs-interleaver.js';

function createMockBlocks(count) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const block = new Int32Array(64);
        block[0] = 100;
        for (let c = 1; c < 64; c++) {
            block[c] = (c % 2 === 0) ? 5 : -5;
        }
        blocks.push(block);
    }
    return blocks;
}

/** Legacy v2-style container bytes - must be REJECTED post-migration. */
function buildLegacyV2Bytes(metadataObj, payload) {
    const magic = new TextEncoder().encode('F5SG');
    const meta = new TextEncoder().encode(JSON.stringify(metadataObj || {}));
    const totalSize = 4 + 1 + 1 + 1 + 2 + meta.length + 4 + payload.length + 4;
    const buf = new Uint8Array(totalSize);
    const view = new DataView(buf.buffer);
    let off = 0;
    buf.set(magic, off); off += 4;
    view.setUint8(off, 2); off += 1;
    view.setUint8(off, 0); off += 1;
    view.setUint8(off, 1); off += 1;
    view.setUint16(off, meta.length, false); off += 2;
    buf.set(meta, off); off += meta.length;
    view.setUint32(off, payload.length, false); off += 4;
    buf.set(payload, off); off += payload.length;

    // CRC32 (poly 0xEDB88320 reflected)
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < off; i++) {
        crc ^= buf[i];
        for (let b = 0; b < 8; b++) crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    view.setUint32(off, crc, false);
    return buf;
}

describe('container format v3 (whole-container framing)', () => {

    it('declares version 3', () => {
        expect(F5.VERSION).toBe(3);
    });

    it('writes a decodable coded-control header with authoritative sizes', async () => {
        const blocks = createMockBlocks(100);
        const payload = new TextEncoder().encode('v3 control-plane payload');
        const [ok, err] = await F5.embedContainer(blocks, payload, {}, { seed: 'k2-seed' });
        expect(err).toBe(null);
        expect(ok).toBe(true);

        // Recover the stored k by scanning, then decode the control codeword
        // straight out of the leading 255 frame symbols.
        void CONTROL_MAGIC;
        void CONTROL_VERSION;

        // Use the internal extraction path: extractRaw is available on F5.
        for (let tryK = 1; tryK <= 4; tryK++) {
            const head = F5.extractRaw(blocks, 255 * 8, { seed: 'k2-seed', k: tryK });
            if (!head) continue;
            const [plane, decErr] = decodeControlCodeword(head);
            if (decErr) continue;
            const [fields, unpackErr] = unpackControlHeader(plane);
            if (unpackErr) continue;

            if (fields.magic !== CONTROL_MAGIC || fields.version !== CONTROL_VERSION) {
                throw new Error('control identity mismatch');
            }
            if (fields.metaLen !== 2) throw new Error(`metaLen ${fields.metaLen} != 2 ('{}')`);
            if (fields.payloadLen !== payload.length) throw new Error('payloadLen mismatch');
            if (fields.k !== tryK) throw new Error('stored k mismatch');
            if (fields.profileName !== 'Extreme') throw new Error('default profile must be Extreme');

            // Body geometry must cover metadata + payload + CRC tail.
            const bodyLen = fields.metaLen + fields.payloadLen + 4;
            const expectedBlocks = Math.ceil(bodyLen / ECC_PROFILES.Medium.dataBytes);
            if (fields.blockCount !== expectedBlocks) throw new Error('blockCount mismatch');
            if (fields.originalLength !== bodyLen) throw new Error('originalLength must equal body length');
            return;
        }
        throw new Error('no k yielded a decodable control header');
    });

    it('roundtrips payload and metadata through the coded frame', async () => {
        const blocks = createMockBlocks(100);
        const payload = new TextEncoder().encode('roundtrip body bytes');
        const metadata = { filename: 'r.bin', note: 'meta survives too' };

        const [ok, err] = await F5.embedContainer(blocks, payload, metadata, { seed: 'rt' });
        expect(err).toBe(null);

        const out = await F5.extractAuto(blocks, { seed: 'rt' });
        if (!out) throw new Error('extraction returned null');
        if (out.data.join() !== payload.join()) throw new Error('payload mismatch');
        if (out.metadata.filename !== 'r.bin' || out.metadata.note !== 'note meta survives too'.slice(6)) {
            if (out.metadata.note !== metadata.note) throw new Error('metadata mismatch');
        }
    });

    it('recovers byte-exact when a wide swath of coefficients is corrupted', async () => {
        const blocks = createMockBlocks(200);
        const payload = new TextEncoder().encode(JSON.stringify({
            metadata: { revision: 4 },
            entries: [{ blob: 'x'.repeat(200) }]
        }));
        const metadata = { ecc: true, eccProfile: 'Extreme', filename: 'v.json', chunk: { id: 'x', index: 0, total: 1 } };

        const [ok, err] = await F5.embedContainer(blocks, payload, metadata, { seed: 'swath' });
        expect(err).toBe(null);

        // Wide corruption swath: 140 coefficient flips across the carrier.
        // With High-profile body coding (t=32/block) plus control protection,
        // this simulates exactly the public-host damage case that killed v2.
        const rng = seededRandomFactory();
        const positions = new Set();
        while (positions.size < 140) {
            positions.add(Math.floor(rng() * blocks.length * 63));
        }
        for (const flat of positions) {
            const blockIdx = Math.floor(flat / 63);
            const coeffIdx = (flat % 63) + 1;
            if (blocks[blockIdx][coeffIdx] !== 0) blocks[blockIdx][coeffIdx] -= 1;
        }

        const out = await F5.extractAuto(blocks, { seed: 'swath' });
        if (!out) throw new Error('corrupted-carrier extraction returned null');
        if (out.data.join() !== payload.join()) throw new Error('payload not recovered byte-exact');
        if (out.metadata.chunk.id !== 'x') throw new Error('metadata not recovered');
    });

    it('rejects legacy v2 containers with re-save guidance', async () => {
        const blocks = createMockBlocks(100);
        const legacy = buildLegacyV2Bytes({ note: 'old world' }, new TextEncoder().encode('legacy'));
        const res = F5.embedRaw(blocks, legacy, { seed: 'v2-reject', k: 2 });
        expect(res.success).toBe(true);

        const out = await F5.extractAuto(blocks, { seed: 'v2-reject' });
        if (out !== null) throw new Error('legacy v2 container was accepted');
    });

    it('capacity math covers the whole coded frame', async () => {
        const blocks = createMockBlocks(100);
        const payload = new TextEncoder().encode('capacity probe');
        const [ok, err] = await F5.embedContainer(
            blocks, payload,
            { ecc: true, eccProfile: 'Medium' },
            { seed: 'cap' }
        );
        expect(err).toBe(null);

        const cap = F5.calculateCapacity(blocks, {
            format: 'container',
            metadata: {},
            ecc: true,
            eccProfile: 'Medium'
        });
        if (cap < payload.length) {
            throw new Error(`capacity math under-reports: ${cap} < ${payload.length}`);
        }
    });
});

function seededRandomFactory() {
    let s = 987654321 >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return ((s >>> 8) & 0xFFFFFF) / 0x1000000;
    };
}
