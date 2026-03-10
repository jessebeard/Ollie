import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { JpegEncoder } from '../../../src/codec/encoder.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { fileURLToPath } from 'url';

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

function arbEntry() {
    return {
        title: Arbitrary.string(1, 50).generate(),
        url: Arbitrary.string(5, 100).generate(),
        username: Arbitrary.string(1, 30).generate(),
        password: Arbitrary.string(8, 64).generate(),
        notes: Arbitrary.string(0, 50).generate()
    };
}

describe('PasswordVault E2E Steganography (Carrier Formats)', () => {
    it('Property: Vault save/load works across Baseline, Progressive, and Subsampled carriers', async () => {
        // Generate a random synthetic image for carrier embedding
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.floor(Math.random() * 256);     // R
            data[i + 1] = Math.floor(Math.random() * 256);   // G
            data[i + 2] = Math.floor(Math.random() * 256);   // B
            data[i + 3] = 255;                               // A
        }
        const imageData = { width, height, data };

        // Pre-encode carrier images using our JpegEncoder to control exact format
        const baselineBytes = await new JpegEncoder(90, { progressive: false, subsampling: '4:4:4' }).encode(imageData);
        const progressiveBytes = await new JpegEncoder(90, { progressive: true, subsampling: '4:4:4' }).encode(imageData);
        const subsampledBytes = await new JpegEncoder(90, { progressive: false, subsampling: '4:2:0' }).encode(imageData);

        const carriers = [
            { name: 'baseline.jpg', bytes: baselineBytes },
            { name: 'progressive.jpg', bytes: progressiveBytes },
            { name: 'subsampled.jpg', bytes: subsampledBytes }
        ];

        await assertProperty(
            [
                Arbitrary.array(() => arbEntry(), 5, 10),
                Arbitrary.string(8, 32)
            ],
            async (entries, password) => {
                let vault = new PasswordVault([], null, true, password);
                for (let i = 0; i < entries.length; i++) {
                    const [newVault] = await vault.addEntry(entries[i]);
                    vault = newVault;
                }

                // Test each carrier format separately
                for (let carrier of carriers) {
                    const mockImage = new MockFile(carrier.bytes, carrier.name);

                    let savedFiles;
                    try {
                        savedFiles = await vault.save([mockImage], password);
                    } catch (e) {
                        if (e.message.includes('capacity')) continue; // Skip if small carrier is insufficient
                        return false;
                    }

                    const extractableFiles = savedFiles.map(f => new MockFile(f.data, f.name));
                    const [restoredVault, err] = await PasswordVault.load(extractableFiles, password);

                    expect(err).toEqual(null);
                    expect(restoredVault.entries.length).toBe(entries.length);

                    const [origJsonStr, oErr] = await vault.getPlaintextJSON();
                    const [restJsonStr, rErr] = await restoredVault.getPlaintextJSON();
                    expect(oErr).toEqual(null);
                    expect(rErr).toEqual(null);

                    const origData = JSON.parse(origJsonStr);
                    const restData = JSON.parse(restJsonStr);

                    for (let i = 0; i < entries.length; i++) {
                        expect(origData.entries[i].title).toBe(restData.entries[i].title);
                        expect(origData.entries[i].password).toBe(restData.entries[i].password);
                    }
                }
                return true;
            },
            3
        );
    });
});
