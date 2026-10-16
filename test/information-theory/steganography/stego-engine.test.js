import { describe, it, expect } from '../../utils/test-runner.js';
import { StegoEngine } from '../../../src/information-theory/steganography/stego-engine.js';

describe('Format v4 StegoEngine (STC + J-UNIWARD + Argon2id)', () => {
    const TEST_PASSWORD = 'strong-v4-master-password';
    const TEST_PAYLOAD = new TextEncoder().encode('Hello Ollie Steganography v4! Secret Vault Data.');
    const KDF_OPTS = { memorySize: 64, passes: 1 }; // fast test profile

    function createMockBlocks(count = 100) {
        const blocks = [];
        for (let b = 0; b < count; b++) {
            const block = new Int32Array(64);
            // Populate typical JPEG AC energy distribution
            for (let c = 1; c < 64; c++) {
                block[c] = ((b * 13 + c * 7) % 21) - 10;
            }
            blocks.push(block);
        }
        return blocks;
    }

    it('calculates safe payload capacity based on 0.05 bpnzAC policy', () => {
        const blocks = createMockBlocks(500); // ~31,500 AC slots, ~30,000 non-zero
        const capacity = StegoEngine.calculateCapacity(blocks, { targetBpnzAC: 0.05 });
        expect(capacity > 0).toBe(true);
    });

    it('embeds and extracts payload with 100% byte-exact fidelity', async () => {
        const blocks = createMockBlocks(150); // ~9,450 AC slots
        const [ok, embedErr] = await StegoEngine.embed(blocks, TEST_PAYLOAD, TEST_PASSWORD, {
            bucketSize: 256,
            kdfOpts: KDF_OPTS
        });
        expect(embedErr).toBe(null);
        expect(ok).toBe(true);

        const [extracted, extractErr] = await StegoEngine.extract(blocks, TEST_PASSWORD, {
            kdfOpts: KDF_OPTS
        });
        expect(extractErr).toBe(null);
        expect(extracted instanceof Uint8Array).toBe(true);
        expect(Array.from(extracted)).toEqual(Array.from(TEST_PAYLOAD));
    });

    it('fails cleanly when extraction is attempted with the wrong password', async () => {
        const blocks = createMockBlocks(150);
        await StegoEngine.embed(blocks, TEST_PAYLOAD, TEST_PASSWORD, {
            bucketSize: 256,
            kdfOpts: KDF_OPTS
        });

        const [extracted, extractErr] = await StegoEngine.extract(blocks, 'incorrect-password-xyz', {
            kdfOpts: KDF_OPTS
        });
        expect(extracted).toBe(null);
        expect(extractErr instanceof Error).toBe(true);
    });

    it('automatically scales bucket to carrier capacity and extracts cleanly (Option C)', async () => {
        // 1500 mock blocks gives capacity for a 512-byte bucket
        const blocks = createMockBlocks(1500);
        const capacity = StegoEngine.calculateCapacity(blocks);
        expect(capacity >= 512).toBe(true);

        // Embed without specifying bucketSize - should scale to the 512 capacity bucket
        const [ok, embedErr] = await StegoEngine.embed(blocks, TEST_PAYLOAD, TEST_PASSWORD, {
            kdfOpts: KDF_OPTS
        });
        expect(embedErr).toBe(null);
        expect(ok).toBe(true);

        // Extract without specifying bucketSize - should find and extract from capacity bucket
        const [extracted, extractErr] = await StegoEngine.extract(blocks, TEST_PASSWORD, {
            kdfOpts: KDF_OPTS
        });
        expect(extractErr).toBe(null);
        expect(extracted instanceof Uint8Array).toBe(true);
        expect(Array.from(extracted)).toEqual(Array.from(TEST_PAYLOAD));
    });
});
