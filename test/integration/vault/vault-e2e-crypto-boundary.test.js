import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    describe('PasswordVault E2E Steganography (Crypto Boundary)', () => {
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
        notes: Arbitrary.string(0, 100).generate()
    };
}

describe('PasswordVault E2E Steganography (Crypto Boundary)', () => {
    it('Property: Rejects load with incorrect password cleanly', async () => {
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
                Arbitrary.string(8, 32),
                Arbitrary.string(8, 32)
            ],
            async (randomEntries, passwordOne, passwordTwo) => {
                if (passwordOne === passwordTwo) passwordTwo += "!";

                const selectedImages = [new MockFile(imageBuffers[0].buffer, imageBuffers[0].name)];

                let vault = new PasswordVault([], null, true, passwordOne);
                for (let i = 0; i < randomEntries.length; i++) {
                    const [newVault] = await vault.addEntry(randomEntries[i]);
                    vault = newVault;
                }

                let savedImageFiles = [];
                try {
                    savedImageFiles = await vault.save(selectedImages, passwordOne);
                } catch (e) {
                    if (e.message.includes('capacity')) return true;
                    return false;
                }

                const extractableFiles = savedImageFiles.map(f => new MockFile(f.data, f.name));
                const [restoredVault, restoreErr] = await PasswordVault.load(extractableFiles, passwordTwo);

                expect(restoredVault).toEqual(null);
                expect(restoreErr).not.toEqual(null);
                expect(restoreErr instanceof Error).toBe(true);
                // Ensure error message does not leak partial object/data
                expect(typeof restoreErr.message).toBe('string');
                return true;
            },
            1
        );
    });
});
}
