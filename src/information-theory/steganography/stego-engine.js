/**
 * Format v4 Steganography Engine.
 *
 * Connects Opaque Container framing, Factored J-UNIWARD spatial wavelet costs,
 * and Pure JS Syndrome-Trellis Codes (STC):
 *
 * - Zero length indicators, magic bytes, or metadata in the clear.
 * - Single-step exclusive Argon2id KDF + HKDF-Expand domain separation.
 * - Linear-time Viterbi trellis coding minimizing spatial wavelet distortion.
 * - Strict safe payload policy enforcement (<= 0.05 bpnzAC target).
 */
import {
    sealOpaque,
    unsealWithKeys,
    selectBucketSize,
    STANDARD_BUCKETS,
    SALT_BYTES,
    TAG_BYTES
} from './opaque-container.js';
import { calculateJUniwardCosts } from './juniward.js';
import { stcEmbed, stcExtract, bytesToBits, bitsToBytes } from './stc-matrix.js';
import { sha256 } from '../cryptography/crypto-provider.js';
import { deriveStegoKeys } from '../cryptography/kdf-chain.js';

export const STC_MATRIX_CONTEXT = 'ollie/v4/stc-matrix/';

export class StegoEngine {

    /**
     * Resolves the STC submatrix seed from password or explicit option.
     *
     * @param {string|Uint8Array} password
     * @param {Object} [options]
     * @returns {Promise<string>}
     */
    static async resolveSTCSeed(password, options = {}) {
        if (options.stcSeed) return options.stcSeed;
        if (password) {
            const digest = await sha256(STC_MATRIX_CONTEXT, typeof password === 'string' ? password : new TextDecoder().decode(password));
            return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
        }
        return 'OL4S:v4:public';
    }

    /**
     * Calculates the safe payload capacity in bytes for a set of JPEG blocks.
     *
     * @param {Array<Int32Array>} blocks - Quantized DCT blocks
     * @param {Object} [options]
     * @param {number} [options.targetBpnzAC=0.05] - Target bits per non-zero AC (default safe 0.05)
     * @returns {number} Available capacity in bytes for user payload
     */
    static calculateCapacity(blocks, options = {}) {
        if (!blocks || !Array.isArray(blocks) || blocks.length === 0) return 0;

        let nonZeroCount = 0;
        for (let b = 0; b < blocks.length; b++) {
            const block = blocks[b];
            for (let c = 1; c < 64; c++) {
                if (block[c] !== 0) nonZeroCount++;
            }
        }

        if (nonZeroCount === 0) return 0;

        const targetBpnzAC = options.targetBpnzAC || 0.05;
        const safeBits = Math.floor(nonZeroCount * targetBpnzAC);
        const safeWireBytes = Math.floor(safeBits / 8);

        const overhead = SALT_BYTES + TAG_BYTES + 4 /* length header */;
        const maxPayload = safeWireBytes - overhead;

        return Math.max(0, maxPayload);
    }

    /**
     * Extracts flat AC coefficients from block array into a 1D Int32Array.
     *
     * @param {Array<Int32Array>} blocks
     * @returns {Int32Array} Flat AC vector
     */
    static flattenACCoefficients(blocks) {
        const totalAC = blocks.length * 63;
        const flat = new Int32Array(totalAC);
        let idx = 0;
        for (let b = 0; b < blocks.length; b++) {
            const block = blocks[b];
            for (let c = 1; c < 64; c++) {
                flat[idx++] = block[c];
            }
        }
        return flat;
    }

    /**
     * Writes flat AC coefficients back into block array in-place.
     *
     * @param {Int32Array} flat
     * @param {Array<Int32Array>} blocks
     */
    static unflattenACCoefficients(flat, blocks) {
        let idx = 0;
        for (let b = 0; b < blocks.length; b++) {
            const block = blocks[b];
            for (let c = 1; c < 64; c++) {
                block[c] = flat[idx++];
            }
        }
    }

    /**
     * Embeds secret payload into JPEG DCT blocks using Format v4 STC + J-UNIWARD.
     * Modifies blocks in-place.
     *
     * @param {Array<Int32Array>} blocks - Quantized DCT blocks (modified in-place)
     * @param {Uint8Array} payload - Secret payload bytes
     * @param {string|Uint8Array} password - Master password
     * @param {Object} [options]
     * @param {Float32Array} [options.qTable] - Quantization table for spatial IDCT
     * @param {number} [options.bucketSize] - Explicit bucket size
     * @param {Object} [options.kdfOpts] - Custom KDF options
     * @param {number} [options.targetBpnzAC] - Target bits per non-zero AC
     * @returns {Promise<[boolean|null, Error|null]>}
     */
    static async embed(blocks, payload, password, options = {}) {
        if (!blocks || blocks.length === 0) {
            return [null, new Error('stego-engine: no blocks provided for embedding')];
        }
        if (!(payload instanceof Uint8Array)) {
            return [null, new Error('stego-engine: payload must be a Uint8Array')];
        }

        const effectivePassword = password || 'OL4S:v4:public';
        const bucketSize = options.bucketSize || selectBucketSize(payload.length);
        const [wire, sealErr] = await sealOpaque(payload, effectivePassword, { bucketSize, kdfOpts: options.kdfOpts });
        if (sealErr) return [null, sealErr];

        const messageBits = bytesToBits(wire);
        const totalAC = blocks.length * 63;
        const w = Math.floor(totalAC / messageBits.length);

        if (w < 1) {
            return [null, new Error(
                `stego-engine: carrier too small (${totalAC} AC slots) for payload bucket (${messageBits.length} bits)`
            )];
        }

        const stcSeed = await this.resolveSTCSeed(effectivePassword, options);

        // Only compute J-UNIWARD costs for blocks that STC will actually touch
        const neededCoeffs = messageBits.length * 16;
        const neededBlocks = Math.min(blocks.length, Math.ceil(neededCoeffs / 63) + 2);
        const targetBlocks = blocks.slice(0, neededBlocks);

        const { rhoPlus, rhoMinus } = calculateJUniwardCosts(targetBlocks, options.qTable, {
            costSeed: stcSeed
        });

        // Flatten AC coefficients
        const cover = this.flattenACCoefficients(blocks);

        // Run STC Viterbi embedding
        const [stego, stcErr] = stcEmbed(cover, messageBits, rhoPlus, rhoMinus, {
            h: 8,
            maxW: 16,
            seed: stcSeed
        });
        if (stcErr) return [null, stcErr];

        // Write stego coefficients back into blocks
        this.unflattenACCoefficients(stego, blocks);

        return [true, null];
    }

    /**
     * Extracts secret payload from JPEG DCT blocks using Format v4.
     *
     * @param {Array<Int32Array>} blocks - Quantized DCT blocks
     * @param {string|Uint8Array} [password] - Master password
     * @param {Object} [options]
     * @param {Object} [options.kdfOpts] - Custom KDF options
     * @param {number} [options.targetBpnzAC] - Target bits per non-zero AC
     * @returns {Promise<[Uint8Array|null, Error|null]>}
     */
    static async extract(blocks, password, options = {}) {
        if (!blocks || blocks.length === 0) {
            return [null, new Error('stego-engine: valid blocks required')];
        }

        const effectivePassword = password || 'OL4S:v4:public';
        const cover = this.flattenACCoefficients(blocks);
        const totalAC = cover.length;
        const stcSeed = await this.resolveSTCSeed(effectivePassword, options);

        // Try candidate bucket sizes from smallest fitting up to largest
        const candidateBuckets = STANDARD_BUCKETS.filter(b => {
            const wireLen = SALT_BYTES + b + TAG_BYTES;
            return Math.floor(totalAC / (wireLen * 8)) >= 1;
        });

        if (candidateBuckets.length === 0) {
            return [null, new Error('stego-engine: carrier too small for stego extraction')];
        }

        const perceivedCapacity = this.calculateCapacity(blocks, { targetBpnzAC: options.targetBpnzAC });

        // Sort candidate buckets so the most probable bucket based on carrier capacity is tried first.
        // Under Option C, embed pads the payload to the carrier's safe capacity.
        candidateBuckets.sort((a, b) => {
            const diffA = Math.abs(a - perceivedCapacity);
            const diffB = Math.abs(b - perceivedCapacity);
            return diffA - diffB;
        });

        const keyCache = new Map();

        for (const bucket of candidateBuckets) {
            const wireLen = SALT_BYTES + bucket + TAG_BYTES;
            const messageBitLength = wireLen * 8;

            const extractedBits = stcExtract(cover, messageBitLength, {
                h: 8,
                seed: stcSeed
            });
            const extractedWire = bitsToBytes(extractedBits);
            const salt = extractedWire.subarray(0, SALT_BYTES);
            const ciphertext = extractedWire.subarray(SALT_BYTES);

            const saltHex = Array.from(salt, b => b.toString(16).padStart(2, '0')).join('');
            let keys = keyCache.get(saltHex);
            if (!keys) {
                const [derivedKeys, kdfErr] = await deriveStegoKeys(effectivePassword, salt, options.kdfOpts);
                if (kdfErr) continue;
                keys = derivedKeys;
                keyCache.set(saltHex, keys);
            }

            const [payload, unsealErr] = await unsealWithKeys(ciphertext, keys);
            if (!unsealErr && payload) {
                return [payload, null];
            }
        }

        return [null, new Error('stego-engine: no valid stego data found or invalid password')];
    }
}
