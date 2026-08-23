import { describe, it, expect } from '../../utils/test-runner.js';
import { F5 } from '../../../src/information-theory/steganography/f5-syndrome.js';
import { KeyDerivation } from '../../../src/information-theory/cryptography/pbkdf2.js';
import { Encryption } from '../../../src/information-theory/cryptography/aes-gcm.js';
import { crc32 } from '../../../src/utils/crc32.js';

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

function buildContainerBytes({ version, metadataObj, payload = new Uint8Array(0) }) {
    const meta = new TextEncoder().encode(JSON.stringify(metadataObj || {}));
    const totalSize = 4 + 1 + 1 + 1 + 2 + meta.length + 4 + payload.length + 4;
    const buf = new Uint8Array(totalSize);
    const view = new DataView(buf.buffer);
    let offset = 0;

    buf.set(new TextEncoder().encode(MAGIC), offset); offset += 4;
    view.setUint8(offset, version); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 1); offset += 1;
    view.setUint16(offset, meta.length, false); offset += 2;
    buf.set(meta, offset); offset += meta.length;
    view.setUint32(offset, payload.length, false); offset += 4;
    buf.set(payload, offset); offset += payload.length;
    view.setUint32(offset, crc32(buf.subarray(0, offset)), false);

    return buf;
}

describe('Container Format v2', () => {

    it('declares format version 2', () => {
        expect(F5.VERSION).toBe(2);
    });

    it('rejects version 1 containers instead of mis-reading them', async () => {
        const blocks = createMockBlocks(50);
        const v1Bytes = buildContainerBytes({ version: 1, metadataObj: { filename: 'old.bin' } });
        const result = F5.embedRaw(blocks, v1Bytes, { seed: 'v1-carrier', k: 1 });
        expect(result.success).toBe(true);

        const extracted = await F5.extractAuto(blocks, { seed: 'v1-carrier' });
        expect(extracted).toEqual(null);
    });

    it('extracts a valid version 2 container', async () => {
        const blocks = createMockBlocks(50);
        const v2Bytes = buildContainerBytes({
            version: 2,
            metadataObj: { filename: 'new.bin', seed: 'plain-seed' },
            payload: new Uint8Array([1, 2, 3])
        });
        const result = F5.embedRaw(blocks, v2Bytes, { seed: 'plain-seed', k: 1 });
        expect(result.success).toBe(true);

        const extracted = await F5.extractAuto(blocks, { seed: 'plain-seed' });
        expect(extracted).not.toEqual(null);
        expect(extracted.metadata.filename).toBe('new.bin');
    });

    it('records KDF parameters in container metadata when a password is used', async () => {
        const blocks = createMockBlocks(80);
        const data = new Uint8Array([9, 8, 7, 6]);
        const metadata = { filename: 'secret.bin', ecc: false };

        const [embedded, embedErr] = await F5.embedContainer(
            blocks, data, metadata, { password: 'hunter2', iterations: 50000 }
        );
        expect(embedErr).toEqual(null);
        expect(embedded).toBe(true);

        const extracted = await F5.extractContainer(blocks, { password: 'hunter2' });
        expect(extracted).not.toEqual(null);
        expect(extracted.metadata.enc.kdf).toBe('PBKDF2-SHA256');
        expect(extracted.metadata.enc.iterations).toBe(50000);
        expect(Array.from(extracted.data)).toEqual(Array.from(data));
    });
});

describe('KDF parameter validation (attacker-controlled metadata)', () => {

    it('rejects iterations far outside the sane range before doing any key derivation', async () => {
        const blocks = createMockBlocks(50);
        const forgedPayload = new Uint8Array(28);
        const v2Bytes = buildContainerBytes({
            version: 2,
            metadataObj: {
                encrypted: true,
                enc: { kdf: 'PBKDF2-SHA256', iterations: 1000000000 }
            },
            payload: forgedPayload
        });
        const result = F5.embedRaw(blocks, v2Bytes, { seed: 'evil', k: 1 });
        expect(result.success).toBe(true);

        const started = Date.now();
        const extracted = await F5.extractAuto(blocks, { seed: 'evil', password: 'x' });
        const elapsed = Date.now() - started;

        expect(extracted).toEqual(null);
        expect(elapsed < 5000).toBe(true);
    });

    it('rejects an encrypted container whose metadata lacks an enc block', async () => {
        const blocks = createMockBlocks(50);
        const v2Bytes = buildContainerBytes({
            version: 2,
            metadataObj: { encrypted: true },
            payload: new Uint8Array(28)
        });
        F5.embedRaw(blocks, v2Bytes, { seed: 'evil2', k: 1 });

        const extracted = await F5.extractAuto(blocks, { seed: 'evil2', password: 'x' });
        expect(extracted).toEqual(null);
    });
});

if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    describe('Parameterized PBKDF2 (Node)', () => {
        it('derives different keys for different iteration counts', async () => {
            const [salt] = KeyDerivation.generateSalt();
            const plaintext = new Uint8Array([1, 2, 3, 4]);

            const [keyFast] = await KeyDerivation.deriveKey('pw', salt, { iterations: 50000 });
            const [keySlow] = await KeyDerivation.deriveKey('pw', salt, { iterations: 60000 });

            const [encResult, encErr] = await Encryption.encrypt(plaintext, keyFast);
            expect(encErr).toEqual(null);

            const [decrypted, decErr] = await Encryption.decrypt(
                encResult.ciphertext, keySlow, encResult.iv
            );
            expect(decErr instanceof Error).toBe(true);
            expect(decrypted).toEqual(null);
        });
    });
} else {
    describe('Parameterized PBKDF2 (Browser)', () => {
        it('Skipped in Browser', () => { expect(true).toBe(true); });
    });
}
