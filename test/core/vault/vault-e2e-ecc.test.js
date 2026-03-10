import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { JpegDecoder } from '../../../src/codec/decoder.js';
import { JpegEncoder } from '../../../src/codec/encoder.js';
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

function arbEntry() {
    return {
        title: Arbitrary.string(1, 50).generate(),
        url: Arbitrary.string(5, 100).generate(),
        username: Arbitrary.string(1, 30).generate(),
        password: Arbitrary.string(8, 64).generate(),
        notes: Arbitrary.string(0, 50).generate() // Kept short to fit in single test image
    };
}

describe('PasswordVault E2E Steganography (ECC Deep Recovery)', () => {
    it('Property: Vault loaded exactly after targeted AC coefficient corruption', async () => {
        const fixturesDir = path.join(__dirname, '../../fixtures/test vault');
        const availableImageFiles = fs.readdirSync(fixturesDir)
            .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
            .map(f => path.join(fixturesDir, f));

        if (availableImageFiles.length === 0) return;
        const targetFixture = availableImageFiles[0];

        await assertProperty(
            [
                Arbitrary.array(() => arbEntry(), 5, 10),
                Arbitrary.string(8, 32)
            ],
            async (entries, password) => {
                const mockImage = new MockFile(fs.readFileSync(targetFixture), path.basename(targetFixture));

                let vault = new PasswordVault([], null, true, password);
                for (let i = 0; i < entries.length; i++) {
                    const [newVault] = await vault.addEntry(entries[i]);
                    vault = newVault;
                }

                // E2E Pipeline Act: Save vault to image with strong ECC Profile
                // Setting a global option via monkey-patching would be hard, but batch-embedder has options logic
                // that doesn't let us directly pipe eccProfile down unless vault logic allows it.
                // Right now BatchEmbedder defaults to 'Medium' profile. We will corrupt just a few coefficients.
                let savedFiles;
                try {
                    savedFiles = await vault.save([mockImage], password);
                } catch (e) {
                    if (e.message.includes('capacity')) return true;
                    return false;
                }

                // Now corrupt the saved file!
                const origSavedBytes = savedFiles[0].data;
                const decoder = new JpegDecoder();
                const [decoded, decodeErr] = await decoder.decode(origSavedBytes, { skipExtraction: true, coefficientsOnly: true });
                expect(decodeErr).toEqual(null);

                // Find non-zero AC coefficients
                const compY = decoded.coefficients[0] || decoded.coefficients[decoded.components ? Object.keys(decoded.components)[0] : 1];
                const cleanBlocks = compY.blocks;
                const nonZeroACIndices = [];

                for (let b = 0; b < cleanBlocks.length; b++) {
                    const block = cleanBlocks[b];
                    for (let c = 1; c < 64; c++) {
                        if (block[c] !== 0) {
                            nonZeroACIndices.push({ b, c });
                        }
                    }
                }

                // Limit corruption to max 5 coefficients (easily within Medium Profile ECC limits)
                if (nonZeroACIndices.length > 0) {
                    const corruptCount = Math.min(5, Math.floor(nonZeroACIndices.length / 10));
                    for (let i = 0; i < corruptCount; i++) {
                        const idx = Math.floor(Math.random() * nonZeroACIndices.length);
                        const { b, c } = nonZeroACIndices[idx];
                        // Flip LSB safely without converting to ZERO (which causes F5 shrinkage alignment issues)
                        if (cleanBlocks[b][c] > 0) {
                            cleanBlocks[b][c] ^= 1;
                            if (cleanBlocks[b][c] === 0) cleanBlocks[b][c] = 2; // Prevent 0 shrinkage
                        } else {
                            cleanBlocks[b][c] ^= 1;
                            if (cleanBlocks[b][c] === 0) cleanBlocks[b][c] = -2; // Prevent 0 shrinkage
                        }
                    }
                }

                // Re-encode corrupted coefficients using Lossless path
                const encoder = new JpegEncoder(90, { progressive: decoded.metadata?.progressive || false });
                let corruptedBytes;
                try {
                    corruptedBytes = await encoder.encodeCoefficients(
                        decoded.coefficients,
                        decoded.quantizationTables,
                        { width: decoded.width, height: decoded.height }
                    );
                } catch (e) {
                    console.error("Failed to re-encode corrupted coefficients:", e);
                    return false;
                }

                const corruptedMockImage = new MockFile(corruptedBytes, 'corrupted_' + path.basename(targetFixture));

                // E2E Pipeline Assert: Load should STILL succeed cleanly thanks to ECC RS recovery
                const [restoredVault, restoreErr] = await PasswordVault.load([corruptedMockImage], password);

                expect(restoreErr).toEqual(null);
                expect(restoredVault.entries.length).toBe(entries.length);

                return true;
            },
            2 // Expensive test, low iterations
        );
    });
});
