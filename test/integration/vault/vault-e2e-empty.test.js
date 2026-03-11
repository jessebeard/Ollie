import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    describe('PasswordVault E2E Steganography (Empty Vault & Capacity Boundary)', () => {
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

describe('PasswordVault E2E Steganography (Empty Vault & Capacity Boundary)', () => {
    it('Property: Saves and loads an empty vault securely', async () => {
        const fixturesDir = path.join(__dirname, '../../fixtures/test vault');
        const availableImageFiles = fs.readdirSync(fixturesDir)
            .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));
        if (!availableImageFiles.length) return;

        const imgBuffer = fs.readFileSync(path.join(fixturesDir, availableImageFiles[0]));

        await assertProperty(
            [Arbitrary.string(8, 32)],
            async (password) => {
                const vault = new PasswordVault([], null, true, password);
                const mockImage = new MockFile(imgBuffer, availableImageFiles[0]);

                const savedFiles = await vault.save([mockImage], password);
                const [restoredVault, err] = await PasswordVault.load(
                    savedFiles.map(f => new MockFile(f.data, f.name)),
                    password
                );

                expect(err).toEqual(null);
                expect(restoredVault.entries.length).toBe(0);
                expect(restoredVault.metadata.version).toBe('2.0');
                return true;
            },
            1
        );
    });

    it('Property: Rejects oversized vault cleanly due to capacity', async () => {
        // Use an 8x8 solid black JPEG from mini vault which has ~0 capacity
        const tinyFile = path.join(__dirname, '../../fixtures/mini vault/solid-black-8x8.jpg');
        if (!fs.existsSync(tinyFile)) return;
        const imgBuffer = fs.readFileSync(tinyFile);

        const vault = new PasswordVault([], null, true, 'test-password');
        let currentVault = vault;
        for (let i = 0; i < 50; i++) {
            const [v] = await currentVault.addEntry({ title: 'Big title to consume sapce' + i, password: 'X'.repeat(64) });
            currentVault = v;
        }

        const mockImage = new MockFile(imgBuffer, 'solid-black-8x8.jpg');
        let caughtError = null;

        try {
            await currentVault.save([mockImage], 'test-password');
            expect(true).toBe(false); // Should not reach here
        } catch (e) {
            caughtError = e;
        }
        expect(caughtError).not.toBeNull();
        expect(
            caughtError.message.includes('Insufficient capacity') ||
            caughtError.message.includes('Not enough image capacity')
        ).toBe(true);
    });
});
}
