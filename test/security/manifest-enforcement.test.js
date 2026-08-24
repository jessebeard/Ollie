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
    const width = 192;
    const height = 192;
    const data = new Uint8ClampedArray(width * height * 4);
    let seed = 1234567;
    for (let i = 0; i < data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed >>> 24) & 0xFF;
        data[i + 1] = (seed >>> 16) & 0xFF;
        data[i + 2] = (seed >>> 8) & 0xFF;
        data[i + 3] = 255;
    }
    const encoder = new JpegEncoder(90, { subsampling: '4:4:4' });
    const out = [];
    for (let i = 0; i < count; i++) {
        const jpegBytes = await encoder.encode({ width, height, data });
        out.push(new MockFile(jpegBytes, `carrier_${i}.jpg`));
    }
    return out;
}

async function savedVault(carriers, password = 'test-pw') {
    // Payload sized to fill every carrier (window measured for 96px q90
    // carriers): big enough to span >2 chunks, small enough to fit all 3.
    let vault = new PasswordVault([], null, true, password);
    for (let i = 0; i < 2; i++) {
        [vault] = await vault.addEntry({
            title: `entry-${i}`,
            username: 'user@example.com',
            password: 'secret-password-value',
            url: 'https://example.com/entry/path',
            notes: 'n'.repeat(600)
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
            if (decErr) throw decErr;
            const m = res.secretMetadata && res.secretMetadata.manifest;
            if (!m) throw new Error(`carrier ${file.name} has no manifest stamped`);
            seen.push(m);
        }

        const first = JSON.stringify(seen[0]);
        for (const m of seen.slice(1)) {
            if (JSON.stringify(m) !== first) throw new Error('manifests differ across carriers');
        }
        if (seen[0].total !== stego.length || seen[0].entries.length !== stego.length) {
            throw new Error('manifest does not describe the full carrier set');
        }
    });

    it('fails closed when carriers carry no manifest (legacy set)', async () => {
        // Build an authentic pre-H1 set: real vault document bytes, embedded
        // through the batch pipeline WITHOUT the manifest option.
        const carriers = await makeCarriers(3);
        let vault = new PasswordVault([], null, true, 'legacy-pw');
        [vault] = await vault.addEntry({ title: 'e', username: 'u', password: 'p' });
        const [, , kdfErr] = await vault._resolveSessionKey();
        if (kdfErr) throw kdfErr;

        const docBytes = new TextEncoder().encode(JSON.stringify({
            metadata: vault.metadata,
            entries: vault.entries.map(e => e.toJSON())
        }));

        const { BatchEmbedder } = await import('../../src/information-theory/steganography/batch-embedder.js');
        const embedder = new BatchEmbedder();
        const [results, embErr] = await embedder.embed(docBytes, carriers, {
            password: 'legacy-pw', filename: 'vault.json'
        });
        if (embErr) throw embErr;
        const stego = results.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));

        const [, loadErr] = await PasswordVault.load(stego, 'legacy-pw');
        if (!(loadErr instanceof Error)) {
            throw new Error('legacy manifest-less carrier set was accepted');
        }
        if (!/manifest/i.test(loadErr.message)) {
            throw new Error(`rejection should cite the manifest: ${loadErr.message}`);
        }
    });

    it('rejects when one carrier disagrees with the others (swap attempt)', async () => {
        const carriers = await makeCarriers(3);
        const stego = await savedVault(carriers);

        // Re-encode carrier 0 from a DIFFERENT save (different chunk set id).
        const otherCarriers = await makeCarriers(3);
        const otherStego = await savedVault(otherCarriers, 'test-pw');

        const mixed = [otherStego[0], ...stego.slice(1)].filter(Boolean);
        if (mixed.length < 2) throw new Error('test setup did not produce enough carriers');

        const [, loadErr] = await PasswordVault.load(mixed, 'test-pw');
        if (!(loadErr instanceof Error)) {
            throw new Error('mixed carrier sets were accepted');
        }
    });

    it('wrong password never yields a silent load', async () => {
        const carriers = await makeCarriers(2);
        const stego = await savedVault(carriers);
        const [, loadErr] = await PasswordVault.load(stego, 'incorrect');
        if (!(loadErr instanceof Error)) throw new Error('wrong password accepted');
    });
});
