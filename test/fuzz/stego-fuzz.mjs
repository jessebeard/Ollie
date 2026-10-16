import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { stcEmbed, stcExtract } from '../../src/information-theory/steganography/stc-matrix.js';
import { sealOpaque, unsealOpaque, selectBucketSize } from '../../src/information-theory/steganography/opaque-container.js';

/**
 * Steganography Fuzz Suite: STC Trellis roundtrip, Opaque container framing,
 * and ciphertext corruption / tampering resilience.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runStegoFuzz(scale = 1) {
    const iters = Math.max(10, Math.floor(25 * scale));

    // 1. STC Trellis roundtrip across randomized covers and messages
    await assertProperty(
        [Arbitrary.byteArray(4, 16), Arbitrary.integer(1, 10000)],
        async (msgBytes, seedVal) => {
            // Convert message bytes to bits
            const msgBits = new Uint8Array(msgBytes.length * 8);
            for (let i = 0; i < msgBytes.length; i++) {
                for (let b = 7; b >= 0; b--) {
                    msgBits[i * 8 + (7 - b)] = (msgBytes[i] >> b) & 1;
                }
            }

            // Cover size must satisfy N >= M * 2 for efficient embedding
            const coverLen = msgBits.length * 4;
            const cover = new Int32Array(coverLen);
            for (let i = 0; i < coverLen; i++) {
                cover[i] = ((i * 37 + seedVal) % 50) - 25;
            }

            const rhoPlus = new Float64Array(coverLen).fill(1.0);
            const rhoMinus = new Float64Array(coverLen).fill(1.0);
            const seed = `stc-seed-${seedVal}`;

            const [stego, embErr] = stcEmbed(cover, msgBits, rhoPlus, rhoMinus, { seed, h: 6, maxW: 4 });
            if (embErr) throw embErr;

            const extractedBits = stcExtract(stego, msgBits.length, { seed, h: 6, maxW: 4 });
            for (let i = 0; i < msgBits.length; i++) {
                if (extractedBits[i] !== msgBits[i]) {
                    throw new Error(`STC bit mismatch at index ${i}`);
                }
            }
        },
        iters
    );

    // 2. Opaque container seal/unseal roundtrip across variable payloads
    const fastKdfOpts = { memorySize: 64, passes: 1 };
    await assertProperty(
        [Arbitrary.byteArray(0, 150)],
        async (payload) => {
            const password = 'fuzz-master-stego-pass';
            const bucketSize = selectBucketSize(payload.length);

            const [wire, sealErr] = await sealOpaque(payload, password, { bucketSize, kdfOpts: fastKdfOpts });
            if (sealErr) throw sealErr;

            const [recovered, unsealErr] = await unsealOpaque(wire, password, { kdfOpts: fastKdfOpts });
            if (unsealErr) throw unsealErr;

            if (recovered.length !== payload.length) {
                throw new Error(`Payload length mismatch: expected ${payload.length}, got ${recovered.length}`);
            }
            for (let i = 0; i < payload.length; i++) {
                if (recovered[i] !== payload[i]) {
                    throw new Error(`Payload byte mismatch at index ${i}`);
                }
            }
        },
        Math.min(15, iters)
    );

    // 3. Sealed envelope tampering fails closed
    const samplePayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const [cleanWire] = await sealOpaque(samplePayload, 'pass', { bucketSize: 256, kdfOpts: fastKdfOpts });

    // Flip bit in ciphertext
    const tampered = new Uint8Array(cleanWire);
    tampered[tampered.length - 5] ^= 0x01;
    const [recTampered, errTampered] = await unsealOpaque(tampered, 'pass', { kdfOpts: fastKdfOpts });
    if (recTampered !== null || !errTampered) {
        throw new Error('Tampered ciphertext was accepted or did not produce typed error');
    }

    // Truncate envelope
    const truncated = cleanWire.slice(0, cleanWire.length - 20);
    const [recTrunc, errTrunc] = await unsealOpaque(truncated, 'pass', { kdfOpts: fastKdfOpts });
    if (recTrunc !== null || !errTrunc) {
        throw new Error('Truncated envelope was accepted or did not produce typed error');
    }
}
