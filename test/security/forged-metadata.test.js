import { describe, it, expect } from '../utils/test-runner.js';
import { F5 } from '../../src/information-theory/steganography/f5-syndrome.js';
import { ErrorCorrection, ECC_PROFILES } from '../../src/information-theory/error-correction/rs-interleaver.js';
import { crc32 } from '../../src/utils/crc32.js';

const MAGIC = 'F5SG';

function createMockBlocks(count) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const block = new Int32Array(64);
        block[0] = 100;
        for (let c = 1; c < 64; c++) {
            block[c] = (c % 2 === 0) ? 3 : -3;
        }
        blocks.push(block);
    }
    return blocks;
}

function buildContainerBytes(metadataObj, payload) {
    const metaBytes = new TextEncoder().encode(JSON.stringify(metadataObj || {}));
    const totalSize = 4 + 1 + 1 + 1 + 2 + metaBytes.length + 4 + payload.length + 4;
    const buf = new Uint8Array(totalSize);
    const view = new DataView(buf.buffer);
    let offset = 0;

    buf.set(new TextEncoder().encode(MAGIC), offset); offset += 4;
    view.setUint8(offset, 2); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 1); offset += 1;
    view.setUint16(offset, metaBytes.length, false); offset += 2;
    buf.set(metaBytes, offset); offset += metaBytes.length;
    view.setUint32(offset, payload.length, false); offset += 4;
    buf.set(payload, offset); offset += payload.length;
    view.setUint32(offset, crc32(buf.subarray(0, offset)), false);

    return buf;
}

describe('Forged ECC metadata defenses (ErrorCorrection.recover)', () => {

    it('roundtrips legitimate profile-mode arguments without regression', () => {
        const data = new Uint8Array(500).fill(0x5A);
        const [protectedResult, protectErr] = ErrorCorrection.protect(data, 'Medium');
        expect(protectErr).toEqual(null);

        const [recovered, recoverErr] = ErrorCorrection.recover(
            protectedResult.encoded, 'Medium', protectedResult.originalLength, protectedResult.blockCount
        );
        expect(recoverErr).toEqual(null);
        expect(recovered.length).toBe(500);
    });

    it('rejects forged originalLength beyond block capacity', async () => {
        const data = new Uint8Array(500).fill(0x5A);
        const [protectedResult] = ErrorCorrection.protect(data, 'Medium');

        const started = Date.now();
        const [recovered, recoverErr] = ErrorCorrection.recover(
            protectedResult.encoded, 'Medium', 100000000, protectedResult.blockCount
        );
        const elapsed = Date.now() - started;

        expect(recovered).toEqual(null);
        expect(recoverErr instanceof Error).toBe(true);
        expect(elapsed < 5000).toBe(true);
    });

    it('rejects forged negative originalLength', () => {
        const data = new Uint8Array(500).fill(0x5A);
        const [protectedResult] = ErrorCorrection.protect(data, 'Medium');

        const [recovered, recoverErr] = ErrorCorrection.recover(
            protectedResult.encoded, 'Medium', -50, protectedResult.blockCount
        );

        expect(recovered).toEqual(null);
        expect(recoverErr instanceof Error).toBe(true);
    });

    it('rejects forged blockCount exceeding the payload length', () => {
        const data = new Uint8Array(500).fill(0x5A);
        const [protectedResult] = ErrorCorrection.protect(data, 'Medium');

        const started = Date.now();
        const [recovered, recoverErr] = ErrorCorrection.recover(
            protectedResult.encoded, 'Medium', 500, 200000
        );
        const elapsed = Date.now() - started;

        expect(recovered).toEqual(null);
        expect(recoverErr instanceof Error).toBe(true);
        expect(elapsed < 5000).toBe(true);
    });

    it('rejects non-integer blockCount', () => {
        const data = new Uint8Array(500).fill(0x5A);
        const [protectedResult] = ErrorCorrection.protect(data, 'Medium');

        const [recovered, recoverErr] = ErrorCorrection.recover(
            protectedResult.encoded, 'Medium', 500, 'many'
        );

        expect(recovered).toEqual(null);
        expect(recoverErr instanceof Error).toBe(true);
    });

    it('rejects unknown profile names with a typed error', () => {
        const [result, err] = ErrorCorrection.protect(new Uint8Array(10), 'Nope');
        expect(result).toEqual(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message.includes('Unknown ECC profile')).toBe(true);
    });

    it('legacy mode rejects payloads shorter than the parity length', () => {
        const [recovered, recoverErr] = ErrorCorrection.recover(new Uint8Array(2), 4);
        expect(recovered).toEqual(null);
        expect(recoverErr instanceof Error).toBe(true);
    });
});

describe('Forged ECC metadata defenses (F5.extractContainer gates)', () => {

    it('rejects containers whose originalLength is absurd before recovery', async () => {
        const blocks = createMockBlocks(120);
        const forged = buildContainerBytes(
            { ecc: true, eccProfile: 'Medium', originalLength: 100000000, blockCount: 400000 },
            new Uint8Array(255 * 3)
        );
        const embedResult = F5.embedRaw(blocks, forged, { seed: 'forged-ecc', k: 1 });
        expect(embedResult.success).toBe(true);

        const started = Date.now();
        const extracted = await F5.extractAuto(blocks, { seed: 'forged-ecc' });
        const elapsed = Date.now() - started;

        expect(extracted).toEqual(null);
        expect(elapsed < 5000).toBe(true);
    });

    it('rejects unknown eccProfile names before recovery', async () => {
        const blocks = createMockBlocks(60);
        const forged = buildContainerBytes(
            { ecc: true, eccProfile: 'Turbo', originalLength: 10, blockCount: 1 },
            new Uint8Array(255)
        );
        F5.embedRaw(blocks, forged, { seed: 'forged-profile', k: 1 });

        const extracted = await F5.extractAuto(blocks, { seed: 'forged-profile' });
        expect(extracted).toEqual(null);
    });

    it('refuses encrypted-flagged containers lacking complete ECC parameters', async () => {
        const blocks = createMockBlocks(60);
        const partial = buildContainerBytes({ ecc: true }, new Uint8Array(600));
        F5.embedRaw(blocks, partial, { seed: 'forged-partial', k: 1 });

        const extracted = await F5.extractAuto(blocks, { seed: 'forged-partial' });
        expect(extracted).toEqual(null);
    });
});
