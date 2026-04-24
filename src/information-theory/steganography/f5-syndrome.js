/**
 * F5 Steganography Implementation
 * 
 * Implements the F5 algorithm for hiding data in JPEG coefficients.
 * F5 uses matrix encoding for improved embedding efficiency and
 * correctly handles "shrinkage" when coefficients become 0.
 * 
 * Key features:
 * - Matrix encoding (k bits embedded changing at most 1 coefficient per n-group)
 * - Permutation of coefficients for uniform change distribution
 * - Shrinkage handling via re-embedding
 */
import { ErrorCorrection, ECC_PROFILES } from '../error-correction/rs-interleaver.js';
import { Encryption } from '../cryptography/aes-gcm.js';
import { KeyDerivation } from '../cryptography/pbkdf2.js';
import { crc32 } from '../../utils/crc32.js';

export class F5 {
    static MAGIC = 'F5SG';
    static VERSION = 1;

    static crc32(data) {
        return crc32(data);
    }

    /**
     * Create a seeded PRNG for permutation.
     * Uses a simple LCG for reproducibility.
     * 
     * @param {Uint8Array|string} seed 
     * @returns {function(): number}
     */
    static createPRNG(seed) {
        let state;
        if (typeof seed === 'string') {
            // Hash string to number
            state = 0;
            for (let i = 0; i < seed.length; i++) {
                state = ((state << 5) - state + seed.charCodeAt(i)) | 0;
            }
            state = Math.abs(state) || 1;
        } else if (seed instanceof Uint8Array) {
            state = 0;
            for (let i = 0; i < Math.min(seed.length, 8); i++) {
                state = (state << 8) | seed[i];
            }
            state = Math.abs(state) || 1;
        } else {
            state = seed || 1;
        }

        // LCG constants (same as Java's Random)
        const a = 25214903917n;
        const c = 11n;
        const m = 1n << 48n;
        let current = BigInt(state);

        return function () {
            current = (a * current + c) % m;
            return Number(current >> 17n) >>> 0;
        };
    }

    /**
     * Collect all usable coefficient indices (non-zero AC coefficients).
     * Returns array of {blockIndex, coeffIndex} pairs.
     * 
     * @param {Array<Int32Array>} blocks 
     * @returns {Array<{block: Int32Array, blockIdx: number, coeffIdx: number}>}
     */
    static collectUsableCoefficients(blocks) {
        const usable = [];
        for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
            const block = blocks[blockIdx];
            for (let coeffIdx = 1; coeffIdx < 64; coeffIdx++) {
                if (block[coeffIdx] !== 0) {
                    usable.push({ block, blockIdx, coeffIdx });
                }
            }
        }
        return usable;
    }


    /**
     * Generate a permutation of indices 0..N-1.
     * CRITICAL: Permutation depends ONLY on N and seed, NOT on coefficient values.
     * 
     * @param {number} N - Total number of AC coefficient positions
     * @param {string|Uint8Array} seed 
     * @returns {Uint32Array} Permuted indices
     */
    static generatePermutation(N, seed) {
        const prng = this.createPRNG(seed);
        const perm = new Uint32Array(N);
        for (let i = 0; i < N; i++) {
            perm[i] = i;
        }
        // Fisher-Yates shuffle
        for (let i = N - 1; i > 0; i--) {
            const j = prng() % (i + 1);
            const temp = perm[i];
            perm[i] = perm[j];
            perm[j] = temp;
        }
        return perm;
    }

    /**
     * Get coefficient from blocks by flat AC index.
     * Index 0 = block 0 coeff 1, index 62 = block 0 coeff 63, index 63 = block 1 coeff 1, etc.
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {number} flatIdx 
     * @returns {{block: Int32Array, coeffIdx: number, val: number}}
     */
    static getCoeffByFlatIndex(blocks, flatIdx) {
        const blockIdx = Math.floor(flatIdx / 63);
        const coeffIdx = (flatIdx % 63) + 1; // AC coeffs are 1-63
        const block = blocks[blockIdx];
        return { block, coeffIdx, val: block[coeffIdx] };
    }

    /**
     * Compute XOR hash for a group of coefficients.
     * Returns k-bit value representing XOR of (1-indexed) positions where LSB == 1.
     * 
     * @param {Array<{block: Int32Array, blockIdx: number, coeffIdx: number}>} group 
     * @returns {number}
     */
    static xorHash(group) {
        let result = 0;
        for (let j = 0; j < group.length; j++) {
            const val = group[j].block[group[j].coeffIdx];
            if ((val & 1) === 1) {
                result ^= (j + 1); // 1-indexed
            }
        }
        return result;
    }

    /**
     * Select optimal k value based on capacity and message size.
     * Higher k = fewer changes but needs more coefficients.
     * 
     * @param {number} usableCount 
     * @param {number} messageBits 
     * @param {number} p1 - Probability of coefficient being ±1 (shrinkage risk)
     * @returns {number}
     */
    static selectK(usableCount, messageBits, p1 = 0.5) {
        for (let k = 4; k >= 1; k--) {
            const n = (1 << k) - 1;
            const P = Math.min(0.9, (n / (n + 1)) * p1 * 1.5);
            const costPerGroup = n + (P / (1 - P));
            const capacityBits = Math.floor((usableCount / costPerGroup) * k);

            if (capacityBits >= messageBits) {
                return k;
            }
        }
        return 1;
    }

    /**
     * Embeds raw data into the provided blocks using F5 algorithm.
     * Modifies the blocks in-place.
     * 
     * SPEC COMPLIANCE: Permutation is generated over ALL AC indices (N = blocks * 63),
     * not just non-zero coefficients. Zeros are skipped during traversal.
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {Uint8Array} data 
     * @param {Object} options - { seed: string|Uint8Array }
     * @returns {{success: boolean, k: number}} Result with k value for extraction
     */
    static embedRaw(blocks, data, options = {}) {
        const seed = options.seed || 'F5default';

        // Count non-zero coefficients AND ones for k selection
        let nonZeroCount = 0;
        let onesCount = 0;
        for (let b = 0; b < blocks.length; b++) {
            for (let c = 1; c < 64; c++) {
                const val = blocks[b][c];
                if (val !== 0) {
                    nonZeroCount++;
                    // OPTIMIZATION: Avoid Math.abs() in hot loop for better performance
                    if (val === 1 || val === -1) onesCount++;
                }
            }
        }
        const p1 = nonZeroCount > 0 ? onesCount / nonZeroCount : 0.5;

        // Convert data to bits
        const bits = [];
        for (let i = 0; i < data.length; i++) {
            for (let j = 7; j >= 0; j--) {
                bits.push((data[i] >> j) & 1);
            }
        }

        // Use provided k or calculate with real p1
        const k = options.k || this.selectK(nonZeroCount, bits.length, p1);
        const n = (1 << k) - 1;

        // CRITICAL: Generate permutation over ALL AC indices
        const totalAC = blocks.length * 63;
        const permutation = this.generatePermutation(totalAC, seed);

        console.log(`F5: Embedding ${bits.length} bits with k=${k}, n=${n}, nonZero=${nonZeroCount}, totalAC=${totalAC}`);

        // Embed k bits at a time using matrix encoding
        let permIdx = 0;
        let bitIdx = 0;
        while (bitIdx < bits.length) {
            // Collect next k bits of message
            let chunk = 0;
            let bitsLoaded = 0;
            for (let b = 0; b < k && bitIdx + b < bits.length; b++) {
                chunk = (chunk << 1) | bits[bitIdx + b];
                bitsLoaded++;
            }

            // If we have fewer than k bits, shift them to the MSB of the k-bit chunk
            // to align with how extractRaw extracts them (from k-1 down to 0).
            if (bitsLoaded < k) {
                chunk <<= (k - bitsLoaded);
            }

            const startPermIdx = permIdx; // Save start position for shrinkage retry

            // Collect n non-zero coefficients by walking permutation
            let group = [];

            while (group.length < n && permIdx < totalAC) {
                const flatIdx = permutation[permIdx];
                const { block, coeffIdx, val } = this.getCoeffByFlatIndex(blocks, flatIdx);
                permIdx++;

                if (val !== 0) {
                    group.push({ block, coeffIdx, val });
                }
            }

            if (group.length < n) {
                console.warn(`F5: Ran out of coefficients at bit ${bitIdx}`);
                return { success: false, k };
            }

            // Compute current hash (XOR of 1-indexed positions where |val| is odd)
            let hash = 0;
            for (let j = 0; j < group.length; j++) {
                // OPTIMIZATION: Use bitwise AND to check for odd instead of Math.abs(val) % 2
                if ((group[j].val & 1) !== 0) {
                    hash ^= (j + 1);
                }
            }

            if (hash === chunk) {
                // Already matches, no change needed
                bitIdx += k;
                continue;
            }

            // Find which coefficient to modify
            const diff = hash ^ chunk;
            const targetIdx = diff - 1; // 0-indexed within group

            if (targetIdx >= group.length) {
                console.warn(`F5: Invalid target index ${targetIdx} for group size ${group.length}`);
                return { success: false, k };
            }

            const entry = group[targetIdx];
            const val = entry.block[entry.coeffIdx];

            // Modify coefficient (decrement magnitude toward 0)
            if (val > 0) {
                entry.block[entry.coeffIdx] = val - 1;
            } else {
                entry.block[entry.coeffIdx] = val + 1;
            }

            // Check for shrinkage
            if (entry.block[entry.coeffIdx] === 0) {
                // Coefficient shrunk to 0, need to re-embed this chunk
                // CRITICAL FIX: Reset permIdx to start of group.
                // The receiver will see the non-shrunk coefficients from this group
                // combined with the next available ones. We must match that view.
                // Since the shrunk coefficient is now 0, it will be skipped in the next pass.
                permIdx = startPermIdx;
                continue;
            }

            bitIdx += k;
        }

        console.log(`F5: Embedded ${bits.length} bits successfully with k=${k}`);
        return { success: true, k };
    }

    /**
     * Extracts raw data from the provided blocks.
     * 
     * SPEC COMPLIANCE: Uses same permutation logic as embedding.
     * Permutation is generated over ALL AC indices, zeros skipped during traversal.
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {number} bitCount - Number of bits to extract
     * @param {Object} options - { seed: string|Uint8Array, k: number }
     * @returns {Uint8Array|null}
     */
    static extractRaw(blocks, bitCount, options = {}) {
        const seed = options.seed || 'F5default';

        // CRITICAL: Generate same permutation as embedding (depends on N and seed only)
        const totalAC = blocks.length * 63;
        const permutation = this.generatePermutation(totalAC, seed);

        // Determine k: use provided value or fall back to selectK
        let k;
        if (options.k !== undefined && options.k !== null) {
            k = options.k;
        } else {
            // Legacy fallback: count coefficients and calculate p1
            let nonZeroCount = 0;
            let onesCount = 0;
            for (let b = 0; b < blocks.length; b++) {
                for (let c = 1; c < 64; c++) {
                    const val = blocks[b][c];
                    if (val !== 0) {
                        nonZeroCount++;
                        // OPTIMIZATION: Avoid Math.abs() in hot loop for better performance
                        if (val === 1 || val === -1) onesCount++;
                    }
                }
            }
            const p1 = nonZeroCount > 0 ? onesCount / nonZeroCount : 0.5;
            k = this.selectK(nonZeroCount, bitCount, p1);
        }
        const n = (1 << k) - 1;

        const bits = [];
        let permIdx = 0;

        while (bits.length < bitCount) {
            // Collect n non-zero coefficients by walking permutation
            let group = [];

            while (group.length < n && permIdx < totalAC) {
                const flatIdx = permutation[permIdx];
                const { block, coeffIdx, val } = this.getCoeffByFlatIndex(blocks, flatIdx);
                permIdx++;

                if (val !== 0) {
                    group.push({ val });
                }
            }

            if (group.length < n) {
                console.warn(`F5: Extraction ran out of coefficients at bit ${bits.length}`);
                return null;
            }

            // Compute hash (XOR of 1-indexed positions where |val| is odd)
            let hash = 0;
            for (let j = 0; j < group.length; j++) {
                // OPTIMIZATION: Use bitwise AND to check for odd instead of Math.abs(val) % 2
                if ((group[j].val & 1) !== 0) {
                    hash ^= (j + 1);
                }
            }

            // Extract k bits from hash
            for (let b = k - 1; b >= 0 && bits.length < bitCount; b--) {
                bits.push((hash >> b) & 1);
            }
        }

        // Convert bits to bytes
        const bytes = new Uint8Array(Math.ceil(bits.length / 8));
        for (let i = 0; i < bits.length; i++) {
            bytes[Math.floor(i / 8)] |= bits[i] << (7 - (i % 8));
        }

        return bytes;
    }

    /**
     * Embeds data with length header (legacy format).
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {Uint8Array} data 
     * @param {Object} options
     * @returns {boolean}
     */
    static embed(blocks, data, options = {}) {
        const dataWithHeader = new Uint8Array(data.length + 4);
        const view = new DataView(dataWithHeader.buffer);
        view.setUint32(0, data.length, false);
        dataWithHeader.set(data, 4);

        const result = this.embedRaw(blocks, dataWithHeader, options);
        return result.success;
    }

    /**
     * Extracts data with length header (legacy format).
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {Object} options
     * @returns {Uint8Array|null}
     */
    static extract(blocks, options = {}) {
        // First extract 4 bytes for length
        const headerBytes = this.extractRaw(blocks, 32, options);
        if (!headerBytes) return null;

        const view = new DataView(headerBytes.buffer);
        const length = view.getUint32(0, false);

        if (length > 100 * 1024 * 1024) {
            // console.warn('F5: Invalid length detected:', length);
            return null;
        }

        // Now extract full data (header + payload)
        const totalBits = (4 + length) * 8;
        const fullData = this.extractRaw(blocks, totalBits, options);
        if (!fullData) return null;

        return fullData.slice(4, 4 + length);
    }

    /**
     * Embeds data using the container format.
     * Format: [Magic:4][Version:1][Flags:1][K:1][MetaLen:2][Metadata:N][PayloadLen:4][Payload:N][CRC:4]
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {Uint8Array} data 
     * @param {Object} metadata 
     * @param {Object} options - { password, seed }
     */
    static async embedContainer(blocks, data, metadata, options = {}) {
        const magic = new TextEncoder().encode(this.MAGIC);
        const version = this.VERSION;
        const flags = 0;

        let payloadToEmbed = data;
        if (options.password) {
            metadata.encrypted = true;
            const [salt, saltErr] = KeyDerivation.generateSalt();
            if (saltErr) return { success: false, error: saltErr };

            const [key, keyErr] = await KeyDerivation.deriveKey(options.password, salt);
            if (keyErr) return { success: false, error: keyErr };

            const [encResult, encErr] = await Encryption.encrypt(data, key);
            if (encErr) return { success: false, error: encErr };
            const { ciphertext, iv } = encResult;

            const encryptedPayload = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
            encryptedPayload.set(salt, 0);
            encryptedPayload.set(iv, salt.length);
            encryptedPayload.set(new Uint8Array(ciphertext), salt.length + iv.length);

            payloadToEmbed = encryptedPayload;
        }

        let protectedPayload = payloadToEmbed;
        if (metadata.ecc) {
            const eccProfile = metadata.eccProfile || 'Medium';
            const [eccResult, eccErr] = ErrorCorrection.protect(payloadToEmbed, eccProfile);
            if (eccErr) {
                console.error('F5: ECC protection failed:', eccErr);
                return null;
            }
            protectedPayload = eccResult.encoded;

            metadata.eccProfile = eccProfile;
            metadata.originalLength = eccResult.originalLength;
            metadata.blockCount = eccResult.blockCount;
        }
        const payloadLen = protectedPayload.length;

        const metaStr = JSON.stringify(metadata);
        const metaBytes = new TextEncoder().encode(metaStr);
        const metaLen = metaBytes.length;

        // Count non-zero coefficients AND ones for k selection
        let nonZeroCount = 0;
        let onesCount = 0;
        for (let b = 0; b < blocks.length; b++) {
            for (let c = 1; c < 64; c++) {
                const val = blocks[b][c];
                if (val !== 0) {
                    nonZeroCount++;
                    // OPTIMIZATION: Avoid Math.abs() in hot loop for better performance
                    if (val === 1 || val === -1) onesCount++;
                }
            }
        }
        const p1 = nonZeroCount > 0 ? onesCount / nonZeroCount : 0.5;
        const totalBits = (4 + 1 + 1 + 1 + 2 + metaLen + 4 + payloadLen + 4) * 8;
        const k = this.selectK(nonZeroCount, totalBits, p1);

        // Container: [Magic:4][Version:1][Flags:1][K:1][MetaLen:2][Metadata][PayloadLen:4][Payload][CRC:4]
        const totalSize = 4 + 1 + 1 + 1 + 2 + metaLen + 4 + payloadLen + 4;

        const container = new Uint8Array(totalSize);
        const view = new DataView(container.buffer);
        let offset = 0;

        container.set(magic, offset); offset += 4;
        view.setUint8(offset, version); offset += 1;
        view.setUint8(offset, flags); offset += 1;
        view.setUint8(offset, k); offset += 1;  // Store k for extraction
        view.setUint16(offset, metaLen, false); offset += 2;
        container.set(metaBytes, offset); offset += metaLen;
        view.setUint32(offset, payloadLen, false); offset += 4;
        container.set(protectedPayload, offset); offset += payloadLen;

        const dataToCrc = container.subarray(0, offset);
        const crcVal = crc32(dataToCrc);
        view.setUint32(offset, crcVal, false); offset += 4;

        // Use password as seed for permutation if provided
        const seed = options.password || options.seed || 'F5default';

        // Pass k to embedRaw to ensure consistency
        const result = this.embedRaw(blocks, container, { seed, k });
        return result.success;
    }

    /**
     * Auto-detects format and extracts data.
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {Object} options
     * @returns {Promise<Uint8Array|Object|null>}
     */
    static async extractAuto(blocks, options = {}) {
        const seed = options.password || options.seed || 'F5default';

        // Try to read magic bytes (4 bytes = 32 bits)
        // CRITICAL: Use k=1 for magic bytes to ensure we can read them reliably
        // regardless of capacity or shrinkage. The embedder must ensure magic bytes
        // are embedded with k=1 or compatible scheme.
        // Actually, F5 standard doesn't specify k for header.
        // But since we don't know k yet, we must guess or use a fixed k.
        // Our embedder uses selectK for the WHOLE container including header.
        // This is a design flaw in the container format if k is variable.

        // However, we can try to extract with k=1 first. If that fails, we might need
        // to try other k values. But wait - the k is stored IN the header.
        // If we used k=4 to embed the header, we can't read it with k=1.

        // RE-READING SPEC: "Store k for extraction".
        // If k is stored inside the container, we must be able to read the container start
        // without knowing k. This implies the start (Magic + k) must be embedded with
        // a fixed k, OR we brute-force k.

        // For now, let's try to extract with the same logic as embedder:
        // The embedder calculates k based on usable coefficients.
        // The extractor calculates k based on usable coefficients.
        // BUT shrinkage changes usable count!

        // FIX: We will try k=1, 2, 3, 4 to find the Magic bytes.
        let magicBytes = null;
        let detectedK = null;

        for (let tryK = 1; tryK <= 4; tryK++) {
            const bytes = this.extractRaw(blocks, 32, { seed, k: tryK });
            if (bytes) {
                const magic = new TextDecoder().decode(bytes);
                if (magic === this.MAGIC) {
                    magicBytes = bytes;
                    detectedK = tryK;
                    break;
                }
            }
        }

        if (!magicBytes) {
            // Fallback: try legacy JSTG or raw F5
            // For legacy F5, we don't have magic bytes, so we just return null here
            // and let the caller handle it? No, the logic below handles it.

            // If we couldn't find MAGIC with any k, it might be legacy F5 or JSTG
            // Let's try to read just with default selectK logic for legacy support
            magicBytes = this.extractRaw(blocks, 32, { seed });
        }

        if (!magicBytes) return null;

        const magic = new TextDecoder().decode(magicBytes);

        if (magic === this.MAGIC) {
            return this.extractContainer(blocks, { ...options, k: detectedK });
        } else if (magic === 'JSTG') {
            // Legacy Jsteg format - can't decode with F5
            console.warn('F5: Detected legacy JSTG format, cannot extract');
            return null;
        } else {
            // Try legacy F5 format
            const extracted = this.extract(blocks, { seed });
            return extracted;
        }
    }

    /**
     * Extracts data using the container format.
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {Object} options
     * @returns {Promise<Object|null>}
     */
    static async extractContainer(blocks, options = {}) {
        const seed = options.password || options.seed || 'F5default';

        // Read fixed header: Magic(4) + Version(1) + Flags(1) + K(1) + MetaLen(2) = 9 bytes = 72 bits
        // We must use the SAME k that was used to find the magic bytes!
        // If we came from extractAuto, we might know it. If not, we have to search again?
        // For now, let's assume we need to search or use the provided options.k if set.

        let headerBytes = null;
        let usedK = options.k;

        if (usedK) {
            headerBytes = this.extractRaw(blocks, 72, { seed, k: usedK });
        } else {
            // Search for k if not provided
            for (let tryK = 1; tryK <= 4; tryK++) {
                const bytes = this.extractRaw(blocks, 72, { seed, k: tryK });
                if (bytes) {
                    const magic = new TextDecoder().decode(bytes.subarray(0, 4));
                    if (magic === this.MAGIC) {
                        headerBytes = bytes;
                        usedK = tryK;
                        break;
                    }
                }
            }
        }

        if (!headerBytes) return null;

        const view = new DataView(headerBytes.buffer);
        let offset = 0;

        const magic = new TextDecoder().decode(headerBytes.subarray(0, 4)); offset += 4;
        if (magic !== this.MAGIC) return null;

        const version = view.getUint8(offset); offset += 1;
        if (version !== this.VERSION) return null;

        const flags = view.getUint8(offset); offset += 1;
        const storedK = view.getUint8(offset); offset += 1;

        // Verify that the k we used to read the header matches the k stored IN the header
        // If they mismatch, it's weird but we should trust the stored k for the rest of the payload?
        // Actually, if we read the header successfully with usedK, then the whole container 
        // was likely embedded with usedK. The storedK is redundant but good for verification.
        if (storedK !== usedK) {
            console.warn(`F5: Warning: Extracted k (${usedK}) differs from stored k (${storedK})`);
        }

        // Use the k that successfully decoded the header for the rest
        const k = usedK;
        const metaLen = view.getUint16(offset, false); offset += 2;

        // Now extract full container up to metadata + payloadLen
        const headerSize = 4 + 1 + 1 + 1 + 2 + metaLen + 4;
        const partialContainer = this.extractRaw(blocks, headerSize * 8, { seed, k });
        if (!partialContainer) return null;

        const partialView = new DataView(partialContainer.buffer);
        offset = 9; // After fixed header

        const metaBytes = partialContainer.subarray(offset, offset + metaLen);
        offset += metaLen;

        let metadata;
        try {
            const jsonString = new TextDecoder().decode(metaBytes);
            metadata = JSON.parse(jsonString);
        } catch (e) {
            console.error('F5: Failed to parse metadata:', e);
            console.error('Corrupted Metadata String:', new TextDecoder().decode(metaBytes));
            return null;
        }

        const payloadLen = partialView.getUint32(offset, false);
        offset += 4;

        if (payloadLen > 100 * 1024 * 1024) {
            console.warn('F5: Invalid payload length:', payloadLen);
            return null;
        }

        // Extract full container including payload and CRC
        const fullSize = headerSize + payloadLen + 4;
        const fullContainer = this.extractRaw(blocks, fullSize * 8, { seed, k });
        if (!fullContainer) return null;

        const fullView = new DataView(fullContainer.buffer);

        offset = headerSize;
        let payload = fullContainer.subarray(offset, offset + payloadLen);
        offset += payloadLen;

        const expectedCrc = fullView.getUint32(offset, false);
        const actualCrc = crc32(fullContainer.subarray(0, offset));

        if (actualCrc !== expectedCrc) {
            if (!metadata.ecc) {
                console.warn('F5: CRC mismatch');
                return null;
            }
            console.warn('F5: CRC mismatch, attempting ECC recovery...');
        }

        if (metadata.ecc) {
            if (metadata.eccProfile && metadata.originalLength !== undefined) {
                const [recovered, recoverErr] = ErrorCorrection.recover(
                    payload,
                    metadata.eccProfile,
                    metadata.originalLength,
                    metadata.blockCount
                );
                if (recoverErr) {
                    console.error('F5: ECC recovery failed:', recoverErr);
                    return null;
                }
                payload = recovered;
            } else {
                payload = ErrorCorrection.recover(payload);
            }
        }

        if (metadata.encrypted) {
            if (!options.password) {
                console.warn('F5: Data is encrypted but no password provided');
                return null;
            }

            const salt = payload.slice(0, 16);
            const iv = payload.slice(16, 28);
            const ciphertext = payload.slice(28);

            const [key, keyErr] = await KeyDerivation.deriveKey(options.password, salt);
            if (keyErr) {
                console.error('F5: Key derivation failed:', keyErr);
                return null;
            }

            const [decryptedPayload, decErr] = await Encryption.decrypt(ciphertext, key, iv);
            if (decErr) {
                console.error('F5: Decryption failed:', decErr);
                return null;
            }
            payload = decryptedPayload;
        }

        return {
            data: payload,
            metadata: metadata
        };
    }

    /**
     * Calculates the maximum capacity in bytes.
     * 
     * @param {Array<Int32Array>} blocks 
     * @param {Object} options
     * @returns {number}
     */
    static calculateCapacity(blocks, options = {}) {
        const usable = this.collectUsableCoefficients(blocks);
        const usableCount = usable.length;

        if (usableCount === 0) return 0;

        // Account for shrinkage: coefficients with |val|=1 may shrink
        let onesCount = 0;
        for (const entry of usable) {
            const val = entry.block[entry.coeffIdx];
            // OPTIMIZATION: Avoid Math.abs() in hot loop for better performance
            if (val === 1 || val === -1) {
                onesCount++;
            }
        }

        // Try different k values and use the one that gives best capacity
        // Higher k = more bits per group but fewer changes
        let bestCapacityBits = 0;
        const p1 = usableCount > 0 ? onesCount / usableCount : 0;

        for (let k = 1; k <= 4; k++) {
            const n = (1 << k) - 1;
            // Shrinkage probability per group: P(shrink) = (n/(n+1)) * p1
            // We apply a safety factor of 1.5 based on empirical failure at k=1
            const P = Math.min(0.9, (n / (n + 1)) * p1 * 1.5);
            // Effective usable coefficients = NZ * (1 - shrinkageRate)
            // This is conservative: assumes we lose the whole group's worth of capacity?
            // No, we lose 1 coeff per shrinkage.
            // But we also lose the EFFORT (the group was processed but yielded 0 bits).
            // Capacity = (Usable / (n + ExpectedLoss)) * k
            // ExpectedLoss per successful group = P/(1-P)
            // Cost per k bits = n + P/(1-P)
            // Bits = Usable * k / (n + P/(1-P))

            const costPerGroup = n + (P / (1 - P));
            const capacityBits = Math.floor((usableCount / costPerGroup) * k);

            if (capacityBits > bestCapacityBits) {
                bestCapacityBits = capacityBits;
            }
        }

        const capacityBytes = Math.floor(bestCapacityBits / 8);

        if (options.format === 'container') {
            let metaStr = JSON.stringify(options.metadata || {});
            const eccMetadataOverhead = options.ecc ? 70 : 0;
            const metaLen = new TextEncoder().encode(metaStr).length + eccMetadataOverhead;
            // Container overhead: Magic(4) + Version(1) + Flags(1) + K(1) + MetaLen(2) + PayloadLen(4) + CRC(4)
            let containerOverhead = 4 + 1 + 1 + 1 + 2 + metaLen + 4 + 4;
            const encryptionOverhead = options.encrypted ? 28 : 0;

            if (options.ecc) {
                const eccProfile = options.eccProfile || 'Medium';
                const profile = ECC_PROFILES[eccProfile];
                const minEncodedSize = 255;
                const availableForECC = capacityBytes - containerOverhead;

                if (availableForECC < minEncodedSize) {
                    return 0;
                }

                const maxBlocks = Math.floor(availableForECC / 255);
                const maxPayloadWithECC = maxBlocks * profile.dataBytes;
                return Math.max(0, maxPayloadWithECC - encryptionOverhead);
            } else {
                const availableForPayload = capacityBytes - containerOverhead - encryptionOverhead;
                return Math.max(0, availableForPayload);
            }
        } else {
            return Math.max(0, capacityBytes - 4); // Legacy header
        }
    }
}

// Backward compatibility: export reader class for container extraction
export class F5Reader {
    constructor(blocks, options = {}) {
        this.blocks = blocks;
        this.seed = options.seed || options.password || 'F5default';
    }

    async extractContainer() {
        return F5.extractContainer(this.blocks, { seed: this.seed });
    }
}
