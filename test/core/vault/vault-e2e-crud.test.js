import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/core/vault/vault-manager.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Generate an arbitrary vault entry
function arbEntry() {
    return {
        title: Arbitrary.string(1, 50).generate(),
        url: Arbitrary.string(5, 100).generate(),
        username: Arbitrary.string(1, 30).generate(),
        password: Arbitrary.string(8, 64).generate(),
        notes: Arbitrary.string(0, 500).generate(),
        tags: Arbitrary.array(Arbitrary.string(1, 10), 0, 5).generate(),
        totp: Arbitrary.string(16, 16).generate(),
        customFields: Arbitrary.array({
            generate: () => ({
                label: Arbitrary.string(1, 20).generate(),
                value: Arbitrary.string(1, 50).generate()
            }),
            shrink: () => []
        }, 0, 3).generate()
    };
}

describe('PasswordVault E2E Steganography (CRUD Survival)', () => {
    it('Property: Vault CRUD survival across save/load', async () => {
        const fixturesDir = path.join(__dirname, '../../fixtures/test vault');
        const availableImageFiles = fs.readdirSync(fixturesDir)
            .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
            .map(f => path.join(fixturesDir, f));

        if (availableImageFiles.length === 0) {
            console.warn("No JPEG images found in test/fixtures/test vault. Skipping E2E test.");
            return;
        }

        const imageBuffers = availableImageFiles.map(img => ({
            name: path.basename(img),
            buffer: fs.readFileSync(img)
        }));

        await assertProperty(
            [
                Arbitrary.array(() => arbEntry(), 10, 30),
                Arbitrary.string(8, 32),
                Arbitrary.integer(1, Math.min(2, availableImageFiles.length))
            ],
            async (randomEntries, masterPass, numImages) => {
                const shuffledImages = [...imageBuffers].sort(() => 0.5 - Math.random());
                const selectedImages = shuffledImages.slice(0, numImages).map(
                    img => new MockFile(img.buffer, img.name)
                );

                let vault = new PasswordVault([], null, true, masterPass);
                for (let i = 0; i < randomEntries.length; i++) {
                    const [newVault, error] = await vault.addEntry(randomEntries[i]);
                    expect(error).toEqual(null);
                    vault = newVault;
                }

                // Mutate vault: Update 30%, Delete 20%
                let currentEntries = vault.entries;
                let expectedCount = currentEntries.length;

                for (let entry of currentEntries) {
                    const rand = Math.random();
                    if (rand < 0.20) { // Delete
                        const [newVault, err] = await vault.deleteEntry(entry.id);
                        expect(err).toEqual(null);
                        vault = newVault;
                        expectedCount--;
                    } else if (rand < 0.50) { // Update (change title & password)
                        const updatedData = { ...entry, title: 'MODIFIED_' + entry.title, password: 'MODIFIED_' + entry.password };
                        const [newVault, err] = await vault.updateEntry(entry.id, updatedData);
                        expect(err).toEqual(null);
                        vault = newVault;
                    }
                }

                expect(vault.entries.length).toBe(expectedCount);

                let savedImageFiles = [];
                try {
                    savedImageFiles = await vault.save(selectedImages, masterPass);
                } catch (e) {
                    if (e.message.includes('Insufficient capacity')) return true;
                    console.error("Save embedding error:", e);
                    return false;
                }

                const extractableFiles = savedImageFiles.map(f => new MockFile(f.data, f.name));
                const [restoredVault, restoreErr] = await PasswordVault.load(extractableFiles, masterPass);

                expect(restoreErr).toEqual(null);
                expect(restoredVault.entries.length).toBe(expectedCount);

                const [originalJsonStr, oErr] = await vault.getPlaintextJSON();
                const [restoredJsonStr, rErr] = await restoredVault.getPlaintextJSON();

                expect(oErr).toEqual(null);
                expect(rErr).toEqual(null);

                const originalData = JSON.parse(originalJsonStr);
                const restoredData = JSON.parse(restoredJsonStr);

                for (let i = 0; i < expectedCount; i++) {
                    const orig = originalData.entries[i];
                    const rest = restoredData.entries[i];
                    expect(orig.id).toBe(rest.id);
                    expect(orig.title).toBe(rest.title);
                    expect(orig.password).toBe(rest.password);
                }
                return true;
            },
            3
        );
    });
});
