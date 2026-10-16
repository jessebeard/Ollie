import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { stcEmbed, stcExtract, bytesToBits } from '../../src/information-theory/steganography/stc-matrix.js';
import { sealOpaque, unsealOpaque, selectBucketSize } from '../../src/information-theory/steganography/opaque-container.js';
import { StegoEngine } from '../../src/information-theory/steganography/stego-engine.js';

describe('Steganography Dedicated PBT Suite', () => {
    it('Property: STC Viterbi trellis coding recovers message bits exactly and bounds distortion (|delta| <= 1)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(2, 10), Arbitrary.integer(100, 1000)],
            (msgBytes, seedVal) => {
                const msgBits = bytesToBits(msgBytes);

                const coverLen = msgBits.length * 4;
                const cover = new Int32Array(coverLen);
                for (let i = 0; i < coverLen; i++) cover[i] = ((i * 13 + seedVal) % 40) - 20;

                const rho = new Float64Array(coverLen).fill(1.0);
                const seed = `pbt-stc-${seedVal}`;

                const [stego, embErr] = stcEmbed(cover, msgBits, rho, rho, { seed, h: 6, maxW: 4 });
                expect(embErr).toBe(null);

                // Check distortion bound: STC must never modify a cover coefficient by more than +/-1
                for (let i = 0; i < coverLen; i++) {
                    expect(Math.abs(stego[i] - cover[i])).toBeLessThanOrEqual(1);
                }

                const extracted = stcExtract(stego, msgBits.length, { seed, h: 6, maxW: 4 });
                for (let i = 0; i < msgBits.length; i++) {
                    expect(extracted[i]).toBe(msgBits[i]);
                }
            },
            30
        );
    });

    it('Property: Opaque container seal -> unseal roundtrip preserves arbitrary payload byte content and constant wire size', async () => {
        const kdfOpts = { memorySize: 64, passes: 1 };
        await assertProperty(
            [Arbitrary.byteArray(0, 100)],
            async (payload) => {
                const password = 'pbt-stego-pass';
                const bucketSize = selectBucketSize(payload.length);

                const [wire, sealErr] = await sealOpaque(payload, password, { bucketSize, kdfOpts });
                expect(sealErr).toBe(null);
                // Wire format must strictly equal bucketSize + 16 (salt) + 16 (tag) = bucketSize + 32
                expect(wire.length).toBe(bucketSize + 32);

                const [unsealed, unsealErr] = await unsealOpaque(wire, password, { kdfOpts });
                expect(unsealErr).toBe(null);
                expect(Array.from(unsealed)).toEqual(Array.from(payload));
            },
            20
        );
    });

    it('Property: StegoEngine capacity is monotonic with respect to non-zero AC count', async () => {
        await assertProperty(
            [Arbitrary.integer(150, 250), Arbitrary.integer(20, 60)],
            (baseCount, addCount) => {
                const makeBlock = () => {
                    const b = new Int32Array(64);
                    for (let i = 1; i < 64; i++) b[i] = (i % 3);
                    return b;
                };

                const setA = Array.from({ length: baseCount }, makeBlock);
                const setB = Array.from({ length: baseCount + addCount }, makeBlock);

                const capA = StegoEngine.calculateCapacity(setA);
                const capB = StegoEngine.calculateCapacity(setB);

                // Both capacities must exceed zero once framing threshold (>138 blocks) is passed
                expect(capA).toBeGreaterThan(0);
                expect(capB).toBeGreaterThan(capA);
            },
            30
        );
    });
});
