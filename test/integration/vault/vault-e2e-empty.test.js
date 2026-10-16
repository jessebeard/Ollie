import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { JpegEncoder } from '../../../src/codec/encoder.js';

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        this.name = name;
        this.size = this.buffer.length;
    }
    async arrayBuffer() {
        return this.buffer.buffer.slice(
            this.buffer.byteOffset,
            this.buffer.byteOffset + this.buffer.byteLength
        );
    }
}

async function loadFixtureBytes(relPath) {
    if (isNode) {
        const fs = (await import('fs')).default;
        const path = (await import('path')).default;
        const { fileURLToPath } = await import('url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const full = path.join(__dirname, '../../fixtures', relPath);
        return fs.readFileSync(full);
    } else {
        const candidates = [
            `../test/fixtures/${relPath}`,
            `/test/fixtures/${relPath}`,
            `test/fixtures/${relPath}`
        ];
        for (const url of candidates) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const ab = await res.arrayBuffer();
                    return new Uint8Array(ab);
                }
            } catch {}
        }
        // Fallback: generate synthetic JPEG if network fetch is unavailable
        const width = 64, height = 64;
        const data = new Uint8ClampedArray(width * height * 4).fill(128);
        return new JpegEncoder(90).encode({ width, height, data });
    }
}

describe('PasswordVault E2E Steganography (Empty Vault & Capacity Boundary)', () => {
    it('Property: Saves and loads an empty vault securely', async () => {
        let imgBuffer;
        if (isNode) {
            const fs = (await import('fs')).default;
            const path = (await import('path')).default;
            const { fileURLToPath } = await import('url');
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const fixturesDir = path.join(__dirname, '../../fixtures/test vault');
            const available = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));
            imgBuffer = fs.readFileSync(path.join(fixturesDir, available[0]));
        } else {
            // Generate a 640x480 carrier JPEG with rich DCT entropy
            const width = 640, height = 480;
            const data = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = (i * 17) & 0xFF;
                data[i + 1] = (i * 31) & 0xFF;
                data[i + 2] = (i * 59) & 0xFF;
                data[i + 3] = 255;
            }
            imgBuffer = await new JpegEncoder(90, { subsampling: '4:4:4' }).encode({ width, height, data });
        }

        await assertProperty(
            [Arbitrary.string(8, 32)],
            async (password) => {
                const vault = new PasswordVault([], null, true, password);
                const mockImage = new MockFile(imgBuffer, 'carrier.jpg');

                const [savedFiles, saveErr] = await vault.save([mockImage], password);
                expect(saveErr).toEqual(null);
                const [restoredVault, err] = await PasswordVault.load(
                    savedFiles.map(f => new MockFile(f.data, f.name)),
                    password
                );

                expect(err).toEqual(null);
                expect(restoredVault.entries.length).toBe(0);
                expect(restoredVault.metadata.version).toBe('3.0');
                return true;
            },
            1
        );
    });

    it('Property: Rejects oversized vault cleanly due to capacity', async () => {
        // Use an 8x8 solid black JPEG which has ~0 capacity
        const imgBuffer = await loadFixtureBytes('solid-black-8x8.jpg');

        const vault = new PasswordVault([], null, true, 'test-password');
        let currentVault = vault;
        for (let i = 0; i < 50; i++) {
            const [v] = await currentVault.addEntry({ title: 'Big title to consume space' + i, password: 'X'.repeat(64) });
            currentVault = v;
        }

        const mockImage = new MockFile(imgBuffer, 'solid-black-8x8.jpg');

        const [, saveErr] = await currentVault.save([mockImage], 'test-password');
        expect(saveErr).not.toBeNull();
        expect(
            saveErr.message.includes('Insufficient capacity') ||
            saveErr.message.includes('Not enough image capacity')
        ).toBe(true);
    });
});
