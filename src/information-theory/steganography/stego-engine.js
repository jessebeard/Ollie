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
export const MAX_STEGO_PAYLOAD_BYTES = 131072; // 128 KB safety ceiling per carrier to prevent excessive memory/trellis growth

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
        const limitBlocks = (options.luminanceOnly && options.yBlockCount) ? options.yBlockCount : blocks.length;
        for (let b = 0; b < limitBlocks; b++) {
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
     * Extracts non-zero AC coefficients and their block/subband index locations.
     *
     * @param {Array<Int32Array>} blocks
     * @param {Object} [options]
     * @returns {{ values: Int32Array, locations: Uint32Array }}
     */
    static getNonZeroAC(blocks, options = {}) {
        let count = 0;
        const totalBlocks = blocks.length;
        const limitBlocks = (options.luminanceOnly && options.yBlockCount) ? options.yBlockCount : totalBlocks;
        for (let b = 0; b < limitBlocks; b++) {
            const blk = blocks[b];
            for (let c = 1; c < 64; c++) {
                if (blk[c] !== 0) count++;
            }
        }
        const values = new Int32Array(count);
        const locations = new Uint32Array(count);
        let idx = 0;
        for (let b = 0; b < limitBlocks; b++) {
            const blk = blocks[b];
            for (let c = 1; c < 64; c++) {
                if (blk[c] !== 0) {
                    values[idx] = blk[c];
                    locations[idx] = (b << 6) | c;
                    idx++;
                }
            }
        }
        return { values, locations };
    }

    /**
     * Writes non-zero stego coefficients back into their original block slots.
     *
     * @param {Int32Array} stegoValues
     * @param {Uint32Array} locations
     * @param {Array<Int32Array>} blocks
     */
    static putNonZeroAC(stegoValues, locations, blocks) {
        for (let i = 0; i < locations.length; i++) {
            const loc = locations[i];
            const b = loc >>> 6;
            const c = loc & 63;
            blocks[b][c] = stegoValues[i];
        }
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

        let wire;
        if (options.sealedWire) {
            wire = options.sealedWire;
        } else {
            if (!(payload instanceof Uint8Array)) {
                return [null, new Error('stego-engine: payload must be a Uint8Array')];
            }
            if (payload.length > MAX_STEGO_PAYLOAD_BYTES) {
                return [null, new Error(`stego-engine: payload (${payload.length}B) exceeds safety ceiling (${MAX_STEGO_PAYLOAD_BYTES}B)`)];
            }

            const effectivePassword = password || 'OL4S:v4:public';
            const bucketSize = options.bucketSize || selectBucketSize(payload.length);
            const [sealed, sealErr] = await sealOpaque(payload, effectivePassword, { bucketSize, kdfOpts: options.kdfOpts });
            if (sealErr) return [null, sealErr];
            wire = sealed;
        }

        const messageBits = bytesToBits(wire);
        const { values: coverValues, locations } = this.getNonZeroAC(blocks, options);
        const totalNZ = coverValues.length;
        const w = Math.floor(totalNZ / messageBits.length);

        if (w < 1) {
            return [null, new Error(
                `stego-engine: carrier too small (${totalNZ} non-zero AC slots) for payload bucket (${messageBits.length} bits)`
            )];
        }

        const stcSeed = options.stcSeed || await this.resolveSTCSeed(password || 'OL4S:v4:public', options);

        const { rhoPlus: fullRhoPlus, rhoMinus: fullRhoMinus } = calculateJUniwardCosts(blocks, options.qTable, {
            costSeed: stcSeed,
            includeIndices: false,
            yBlockCount: options.yBlockCount,
            chromaPenalty: options.chromaPenalty !== undefined ? options.chromaPenalty : 4.0,
            luminanceOnly: options.luminanceOnly
        });

        // Filter distortion costs strictly to the non-zero cover positions
        const nzRhoPlus = new Float64Array(totalNZ);
        const nzRhoMinus = new Float64Array(totalNZ);
        for (let i = 0; i < locations.length; i++) {
            const loc = locations[i];
            const b = loc >>> 6;
            const c = loc & 63;
            const flatIdx = b * 63 + (c - 1);
            nzRhoPlus[i] = fullRhoPlus[flatIdx];
            nzRhoMinus[i] = fullRhoMinus[flatIdx];
        }

        // Run STC Viterbi embedding strictly across non-zero AC coefficients
        const [stegoValues, stcErr] = stcEmbed(coverValues, messageBits, nzRhoPlus, nzRhoMinus, {
            h: 8,
            maxW: options.maxW,
            seed: stcSeed
        });
        if (stcErr) return [null, stcErr];

        // Write stego coefficients back into original block locations
        this.putNonZeroAC(stegoValues, locations, blocks);

        return [true, null];
    }

    /**
     * Extracts candidate wire envelopes from JPEG DCT blocks using STC without requiring master password.
     *
     * @param {Array<Int32Array>} blocks - Quantized DCT blocks
     * @param {Object} [options]
     * @param {string} [options.stcSeed] - Pre-derived STC seed hash
     * @returns {Array<Uint8Array>} Array of candidate wire byte buffers
     */
    static extractCandidateWires(blocks, options = {}) {
        if (!blocks || blocks.length === 0) return [];
        const { values: stegoValues } = this.getNonZeroAC(blocks, options);
        const totalNZ = stegoValues.length;
        const stcSeed = options.stcSeed || 'OL4S:v4:public';

        const candidateBuckets = STANDARD_BUCKETS.filter(b => {
            const wireLen = SALT_BYTES + b + TAG_BYTES;
            return Math.floor(totalNZ / (wireLen * 8)) >= 1;
        });

        if (candidateBuckets.length === 0) return [];

        const perceivedCapacity = this.calculateCapacity(blocks, {
            targetBpnzAC: options.targetBpnzAC,
            luminanceOnly: options.luminanceOnly,
            yBlockCount: options.yBlockCount
        });

        candidateBuckets.sort((a, b) => {
            const diffA = Math.abs(a - perceivedCapacity);
            const diffB = Math.abs(b - perceivedCapacity);
            return diffA - diffB;
        });

        const wires = [];
        for (const bucket of candidateBuckets) {
            const wireLen = SALT_BYTES + bucket + TAG_BYTES;
            const messageBitLength = wireLen * 8;
            const extractedBits = stcExtract(stegoValues, messageBitLength, {
                h: 8,
                maxW: options.maxW,
                seed: stcSeed
            });
            wires.push(bitsToBytes(extractedBits));
        }
        return wires;
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
        const { values: stegoValues } = this.getNonZeroAC(blocks, options);
        const totalNZ = stegoValues.length;
        const stcSeed = await this.resolveSTCSeed(effectivePassword, options);

        // Try candidate bucket sizes from smallest fitting up to largest
        const candidateBuckets = STANDARD_BUCKETS.filter(b => {
            const wireLen = SALT_BYTES + b + TAG_BYTES;
            return Math.floor(totalNZ / (wireLen * 8)) >= 1;
        });

        if (candidateBuckets.length === 0) {
            return [null, new Error('stego-engine: carrier too small for stego extraction')];
        }

        const perceivedCapacity = this.calculateCapacity(blocks, {
            targetBpnzAC: options.targetBpnzAC,
            luminanceOnly: options.luminanceOnly,
            yBlockCount: options.yBlockCount
        });

        // Sort candidate buckets so the most probable bucket based on carrier capacity is tried first.
        candidateBuckets.sort((a, b) => {
            const diffA = Math.abs(a - perceivedCapacity);
            const diffB = Math.abs(b - perceivedCapacity);
            return diffA - diffB;
        });

        const keyCache = new Map();

        for (const bucket of candidateBuckets) {
            const wireLen = SALT_BYTES + bucket + TAG_BYTES;
            const messageBitLength = wireLen * 8;

            const extractedBits = stcExtract(stegoValues, messageBitLength, {
                h: 8,
                maxW: options.maxW,
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
