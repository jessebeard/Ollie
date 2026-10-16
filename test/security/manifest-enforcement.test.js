import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { JpegEncoder } from '../../src/codec/encoder.js';

class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
        this.size = buffer.length;
    }
    async arrayBuffer() {
        return this.buffer.buffer.slice(
            this.buffer.byteOffset,
            this.buffer.byteOffset + this.buffer.byteLength
        );
    }
}

async function makeCarriers(count) {
    const width = 256;
    const height = 256;
    const data = new Uint8ClampedArray(width * height * 4);
    let seed = 1234567;
    for (let i = 0; i < data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed >>> 24) & 0xFF;
        data[i + 1] = (seed >>> 16) & 0xFF;
        data[i + 2] = (seed >>> 8) & 0xFF;
        data[i + 3] = 255;
    }
    const encoder = new JpegEncoder(90);
    const out = [];
    for (let i = 0; i < count; i++) {
        const jpegBytes = await encoder.encode({ width, height, data });
        out.push(new MockFile(jpegBytes, `carrier_${i}.jpg`));
    }
    return out;
}

async function savedVault(carriers, password = 'test-pw') {
    let vault = new PasswordVault([], null, true, password);
    for (let i = 0; i < 2; i++) {
        [vault] = await vault.addEntry({
            title: `entry-${i}`,
            username: 'user@example.com',
            password: 'secret-password-value',
            url: 'https://example.com/entry/path',
            notes: 'n'.repeat(100)
        });
    }
    const [results, err] = await vault.save(carriers, password);
    if (err) throw err;
    return results.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));
}

describe('manifest enforcement across batch pipeline', () => {

    it('embedder stamps an identical signed manifest into every carrier', async () => {
        const carriers = await makeCarriers(3);
        const stego = await savedVault(carriers);

        const { JpegDecoder } = await import('../../src/codec/decoder.js');
        const seen = [];
        for (const file of stego) {
            const decoder = new JpegDecoder();
            const [res, decErr] = await decoder.decode(
                new Uint8Array(await file.arrayBuffer()), { password: 'test-pw' }
            );
            expect(decErr).toBe(null);
            const m = res.secretMetadata && res.secretMetadata.manifest;
            expect(m).not.toBe(null);
            seen.push(m);
        }

        const strip = (x) => { const c = { ...x }; delete c.share; delete c.mac; return JSON.stringify(c); };
        for (const m of seen.slice(1)) {
            expect(strip(m)).toBe(strip(seen[0]));
        }
        const shareIdx = new Set(seen.map(m => m.share && m.share.index));
        expect(shareIdx.size).toBe(seen.length);
        expect(seen[0].total).toBe(stego.length);
        expect(seen[0].entries).toHaveLength(stego.length);
    });

    it('fails closed when carriers carry no manifest (legacy set)', async () => {
        // Build an authentic pre-H1 set: real vault document bytes, embedded
        // through the batch pipeline WITHOUT the manifest option.
        const carriers = await makeCarriers(3);
        let vault = new PasswordVault([], null, true, 'legacy-pw');
        [vault] = await vault.addEntry({ title: 'e', username: 'u', password: 'p' });
        const [, , kdfErr] = await vault._resolveSessionKey();
        expect(kdfErr).toBe(null);

        const docBytes = new TextEncoder().encode(JSON.stringify({
            metadata: vault.metadata,
            entries: vault.entries.map(e => e.toJSON())
        }));

        const { BatchEmbedder } = await import('../../src/information-theory/steganography/batch-embedder.js');
        const embedder = new BatchEmbedder();
        const [results, embErr] = await embedder.embed(docBytes, carriers, {
            password: 'legacy-pw', filename: 'vault.json'
        });
        expect(embErr).toBe(null);
        const stego = results.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));

        const [, loadErr] = await PasswordVault.load(stego, 'legacy-pw');
        expect(loadErr).toBeInstanceOf(Error);
        expect(loadErr.message).toMatch(/manifest/i);
    });

    it('rejects when one carrier disagrees with the others (swap attempt)', async () => {
        const carriers = await makeCarriers(3);
        const stego = await savedVault(carriers);

        // Re-encode carrier 0 from a DIFFERENT save (different chunk set id).
        const otherCarriers = await makeCarriers(3);
        const otherStego = await savedVault(otherCarriers, 'test-pw');

        const mixed = [otherStego[0], ...stego.slice(1)].filter(Boolean);
        expect(mixed.length).toBeGreaterThanOrEqual(2);

        const [, loadErr] = await PasswordVault.load(mixed, 'test-pw');
        expect(loadErr).toBeInstanceOf(Error);
    });

    it('wrong password never yields a silent load', async () => {
        const carriers = await makeCarriers(3);
        const stego = await savedVault(carriers);
        const [, loadErr] = await PasswordVault.load(stego, 'incorrect');
        expect(loadErr).toBeInstanceOf(Error);
    });
});
