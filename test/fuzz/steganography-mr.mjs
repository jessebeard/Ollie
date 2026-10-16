import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { StegoEngine } from '../../src/information-theory/steganography/stego-engine.js';
import { stcEmbed, stcExtract } from '../../src/information-theory/steganography/stc-matrix.js';
import { createManifest, verifyManifest } from '../../src/information-theory/steganography/carrier-manifest.js';

/**
 * Steganography Metamorphic Relations Fuzz Suite.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runSteganographyMrFuzz(scale = 1) {
    const iters = Math.max(10, Math.floor(20 * scale));

    // MR-stego-1: Embedding determinism
    // embed(cover, msg, seed) called twice produces bit-exact identical stego outputs
    await assertProperty(
        [Arbitrary.byteArray(4, 12), Arbitrary.integer(1, 1000)],
        async (msgBytes, seedVal) => {
            const msgBits = new Uint8Array(msgBytes.length * 8);
            for (let i = 0; i < msgBytes.length; i++) {
                for (let b = 7; b >= 0; b--) {
                    msgBits[i * 8 + (7 - b)] = (msgBytes[i] >> b) & 1;
                }
            }

            const coverLen = msgBits.length * 4;
            const cover = new Int32Array(coverLen);
            for (let i = 0; i < coverLen; i++) cover[i] = (i % 20) - 10;

            const rho = new Float64Array(coverLen).fill(1.0);
            const seed = `mr-seed-${seedVal}`;

            const [stego1] = stcEmbed(cover, msgBits, rho, rho, { seed, h: 6, maxW: 4 });
            const [stego2] = stcEmbed(cover, msgBits, rho, rho, { seed, h: 6, maxW: 4 });

            for (let i = 0; i < coverLen; i++) {
                if (stego1[i] !== stego2[i]) {
                    throw new Error(`Embedding non-determinism at coefficient ${i}`);
                }
            }
        },
        iters
    );

    // MR-stego-2: Capacity monotonicity
    // Adding blocks with non-zero AC coefficients strictly increases or preserves safe capacity
    await assertProperty(
        [Arbitrary.integer(10, 50), Arbitrary.integer(1, 30)],
        async (baseBlocks, extraBlocks) => {
            const makeBlock = () => {
                const blk = new Int32Array(64);
                for (let i = 1; i < 64; i++) blk[i] = (i % 5); // Non-zero ACs
                return blk;
            };

            const blocksA = Array.from({ length: baseBlocks }, makeBlock);
            const blocksB = Array.from({ length: baseBlocks + extraBlocks }, makeBlock);

            const capA = StegoEngine.calculateCapacity(blocksA);
            const capB = StegoEngine.calculateCapacity(blocksB);

            if (capB < capA) {
                throw new Error(`Capacity monotonicity violated: ${capB} < ${capA}`);
            }
        },
        iters
    );

    // MR-stego-3: Key isolation
    // Extracting with seed1 vs seed2 on non-trivial stego stream yields divergent bits
    await assertProperty(
        [Arbitrary.byteArray(8, 16)],
        async (msgBytes) => {
            const msgBits = new Uint8Array(msgBytes.length * 8);
            for (let i = 0; i < msgBytes.length; i++) {
                for (let b = 7; b >= 0; b--) {
                    msgBits[i * 8 + (7 - b)] = (msgBytes[i] >> b) & 1;
                }
            }

            const coverLen = msgBits.length * 4;
            const cover = new Int32Array(coverLen);
            for (let i = 0; i < coverLen; i++) cover[i] = (i * 11) % 31;
            const rho = new Float64Array(coverLen).fill(1.0);

            const [stego] = stcEmbed(cover, msgBits, rho, rho, { seed: 'stc-key-alpha', h: 6, maxW: 4 });
            const extWrong = stcExtract(stego, msgBits.length, { seed: 'stc-key-beta', h: 6, maxW: 4 });

            let diffs = 0;
            for (let i = 0; i < msgBits.length; i++) {
                if (extWrong[i] !== msgBits[i]) diffs++;
            }
            if (diffs === 0) {
                throw new Error('Key isolation violated: wrong seed decoded original message');
            }
        },
        iters
    );

    // MR-stego-4: Manifest HMAC tamper
    const [manifest] = await createManifest({
        chunkSetId: '00000000-0000-4000-8000-000000000002',
        records: [{ index: 0, checksum: 12345 }],
        revision: 1,
        password: 'stego-mr-password'
    });

    const tamperedManifest = { ...manifest, revision: 2 };
    const [ok] = await verifyManifest(tamperedManifest, 'stego-mr-password');
    if (ok !== false) {
        throw new Error('Manifest tamper MR failed: tampered revision was accepted');
    }
}
