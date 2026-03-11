import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    describe('PasswordVault E2E Steganography (Multi-Generation Overwrite)', () => {
        it('Skipped in Browser', () => { expect(true).toBe(true); });
    });
} else {

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

describe('PasswordVault E2E Steganography (Multi-Generation Overwrite)', () => {
    it('Property: Overwriting a previously saved image cleanly replaces old data', async () => {
        const fixturesDir = path.join(__dirname, '../../fixtures/test vault');
        const availableImageFiles = fs.readdirSync(fixturesDir)
            .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
            .map(f => path.join(fixturesDir, f));

        if (availableImageFiles.length === 0) return;

        const imageBuffers = availableImageFiles.map(img => ({
            name: path.basename(img),
            buffer: fs.readFileSync(img)
        }));

        await assertProperty(
            [
                Arbitrary.array(() => arbEntry(), 5, 15),
                Arbitrary.array(() => arbEntry(), 3, 5),
                Arbitrary.string(8, 32),
                Arbitrary.integer(1, Math.min(2, availableImageFiles.length))
            ],
            async (entriesV1, entriesAdded, password, numImages) => {
                const shuffledImages = [...imageBuffers].sort(() => 0.5 - Math.random());
                const rawFixtureImages = shuffledImages.slice(0, numImages).map(
                    img => new MockFile(img.buffer, img.name)
                );

                // Generation 1: Create V1 and save
                let vaultV1 = new PasswordVault([], null, true, password);
                for (let i = 0; i < entriesV1.length; i++) {
                    const [newVault] = await vaultV1.addEntry(entriesV1[i]);
                    vaultV1 = newVault;
                }

                let savedImagesV1;
                try {
                    savedImagesV1 = await vaultV1.save(rawFixtureImages, password);
                } catch (e) {
                    if (e.message.includes('capacity')) return true;
                    return false;
                }

                const extractableFilesV1 = savedImagesV1.map(f => new MockFile(f.data, f.name));
                const [loadedV1, err1] = await PasswordVault.load(extractableFilesV1, password);
                expect(err1).toEqual(null);

                // Generation 2: Mutate loaded V1 into V2
                let vaultV2 = loadedV1;
                for (let i = 0; i < entriesAdded.length; i++) {
                    const [newVault] = await vaultV2.addEntry(entriesAdded[i]);
                    vaultV2 = newVault;
                }

                // Save V2 BACK INTO the images output by V1's save (multi-gen)
                // This forces F5/JpegTranscoder to overwrite existing steganography
                let savedImagesV2;
                try {
                    savedImagesV2 = await vaultV2.save(extractableFilesV1, password);
                } catch (e) {
                    if (e.message.includes('capacity')) return true;
                    return false;
                }

                const extractableFilesV2 = savedImagesV2.map(f => new MockFile(f.data, f.name));
                const [loadedV2, err2] = await PasswordVault.load(extractableFilesV2, password);

                expect(err2).toEqual(null);
                expect(loadedV2.entries.length).toBe(entriesV1.length + entriesAdded.length);

                const [v2Json, v2Err] = await vaultV2.getPlaintextJSON();
                const [l2Json, l2Err] = await loadedV2.getPlaintextJSON();
                expect(v2Err).toEqual(null);
                expect(l2Err).toEqual(null);

                const v2Data = JSON.parse(v2Json);
                const l2Data = JSON.parse(l2Json);

                for (let i = 0; i < loadedV2.entries.length; i++) {
                    expect(v2Data.entries[i].title).toBe(l2Data.entries[i].title);
                    expect(v2Data.entries[i].password).toBe(l2Data.entries[i].password);
                }

                return true;
            },
            1
        );
    });
});
}
