import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';
import { logger } from '../../src/utils/logger.js';

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

async function makeCarriers(count, size = 128) {
    const width = size;
    const height = size;
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
        out.push(new MockFile(await encoder.encode({ width, height, data }), `carrier_${i}.jpg`));
    }
    return out;
}

async function savedThresholdVault(carriers, password, threshold) {
    let vault = new PasswordVault([], null, true, password);
    [vault] = await vault.addEntry({
        title: 'bank', username: 'user@example.com',
        password: 'secret-password-value', url: 'https://example.com'
    });
    const [results, err] = await vault.save(carriers, password, null, { threshold });
    if (err) throw err;
    return results.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));
}

async function readSecretMetadata(file, password) {
    const decoder = new JpegDecoder();
    const [res, err] = await decoder.decode(new Uint8Array(await file.arrayBuffer()), { password });
    if (err) throw err;
    return res.secretMetadata;
}

describe('threshold vault recovery (CSS integration)', () => {

    it('stamps distinct coded stripes, a share, and an ec block into every carrier', async () => {
        const stego = await savedThresholdVault(await makeCarriers(3), 'pw-threshold', 2);

        const seenShareIndices = new Set();
        const seenChecksums = new Set();
        for (let i = 0; i < stego.length; i++) {
            const meta = await readSecretMetadata(stego[i], 'pw-threshold');
            if (!meta) {
                throw new Error(`carrier ${i} missing secretMetadata`);
            }
            if (!meta.manifest) throw new Error(`carrier ${i} missing manifest`);
            logger.warn(`[DBG] carrier ${i} chunk=${JSON.stringify(meta.chunk)} keys=${JSON.stringify(Object.keys(meta))} manifestShare=${!!meta.manifest.share} ec=${JSON.stringify(meta.manifest.ec)}`);
            const m = meta.manifest;
            if (!m.share) throw new Error(`carrier ${i} missing share`);
            if (!m.ec) throw new Error(`carrier ${i} missing ec block`);
            if (m.ec.k !== 2 || m.ec.n !== 3) throw new Error(`ec block wrong: ${JSON.stringify(m.ec)}`);
            if (m.share.threshold !== 2) throw new Error('share threshold mismatch');
            if (meta.chunk.index !== i || meta.chunk.total !== 3) {
                throw new Error(`carrier ${i} must hold coded stripe ${i} of 3`);
            }
            seenShareIndices.add(m.share.index);
            seenChecksums.add(meta.checksum);
            logger.warn(`[DBG] stamps: i=${i} idx=${meta.chunk.index} checksum=${meta.checksum} dataLen=${meta.chunk ? 'n/a' : 'n/a'} total=${meta.chunk.total}`);
        }

        if (seenShareIndices.size !== 3) throw new Error('share indices must be distinct across carriers');
        // Coded stripes are DIFFERENT data now - checksums must diverge.
        if (seenChecksums.size !== 3) throw new Error('coded stripes should have distinct checksums');
    });

    it('loads from every carrier', async () => {
        const stego = await savedThresholdVault(await makeCarriers(3), 'pw-threshold', 2);
        const [vault, err] = await PasswordVault.load(stego, 'pw-threshold');
        expect(err).toBe(null);
        if (!vault || !vault.isUnlocked) throw new Error('vault did not unlock');
        if (vault.entries.length !== 1) throw new Error('entry count mismatch');
    });

    it('recovers from ANY threshold subset of carriers', async () => {
        const stego = await savedThresholdVault(await makeCarriers(3), 'pw-threshold', 2);
        void stego;

        // Fresh save so we control subsets deterministically.
        const fresh = await savedThresholdVault(await makeCarriers(3), 'pw2', 2);
        const subsets = [
            [fresh[0], fresh[1]],
            [fresh[0], fresh[2]],
            [fresh[1], fresh[2]]
        ];
        for (const subset of subsets) {
            const [vault, err] = await PasswordVault.load(subset, 'pw2');
            expect(err).toBe(null);
            if (!vault || !vault.isUnlocked) throw new Error('subset failed to unlock');
        }
    });

    it('grows usable capacity by adding photos (small photo no longer caps)', async () => {
        // One small photo + three large ones. The document is deliberately
        // larger than k x small-carrier capacity - the old replicate model
        // would reject this outright.
        const small = await makeCarriers(1, 64);
        const large = await makeCarriers(3, 320);
        const carriers = [...small, ...large];

        let vault = new PasswordVault([], null, true, 'grow-pw');
        [vault] = await vault.addEntry({
            title: 'big-entry', username: 'user@example.com',
            password: 'secret-password-value', url: 'https://example.com',
            notes: 'p'.repeat(4000)
        });
        const [results, saveErr] = await vault.save(carriers, 'grow-pw', null, { threshold: 2 });
        if (saveErr) throw new Error(`heterogeneous save failed: ${saveErr.message}`);

        // The tiny photo cannot host one stripe at the planned size, so it
        // contributes its share slot only - exactly 3 coded carriers remain.
        if (results.length !== 3) {
            throw new Error(`expected 3 coded carriers (small skipped), got ${results.length}`);
        }
        const stego = results.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));

        // Full set loads...
        const [full, fullErr] = await PasswordVault.load(stego, 'grow-pw');
        expect(fullErr).toBe(null);
        if (!full || !full.isUnlocked) throw new Error('heterogeneous full set failed to unlock');

        // ...and ANY two of the three large carriers recover (loss tolerance).
        for (const drop of [0, 1, 2]) {
            const subset = stego.filter((_, i) => i !== drop);
            const [vault2, err2] = await PasswordVault.load(subset, 'grow-pw');
            expect(err2).toBe(null);
            if (!vault2 || !vault2.isUnlocked) throw new Error(`subset without ${drop} failed`);
        }

        void large;
    });

    it('fails cleanly below the threshold', async () => {
        const stego = await savedThresholdVault(await makeCarriers(3), 'pw-threshold', 2);
        const [, err] = await PasswordVault.load([stego[0]], 'pw-threshold');
        if (!(err instanceof Error)) throw new Error('single-carrier load accepted below threshold');
    });

    it('counts unique shares, not file copies, toward the threshold', async () => {
        const stego = await savedThresholdVault(await makeCarriers(3), 'dup-pw', 2);

        // Two unique shares + one redundant copy of carrier 0: still recovers.
        const duplicated = [stego[0], stego[1], stego[0]];
        const [vault, okErr] = await PasswordVault.load(duplicated, 'dup-pw');
        expect(okErr).toBe(null);
        if (!vault || !vault.isUnlocked) throw new Error('redundant copy broke recovery');

        // One unique share padded with its own copy: below threshold.
        const [, err] = await PasswordVault.load([stego[0], stego[0]], 'dup-pw');
        if (!(err instanceof Error)) throw new Error('one unique share satisfied a threshold of 2');
    });
});
