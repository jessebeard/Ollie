/**
 * Format v4.1 Carrier Salt Derivation.
 *
 * Derives a deterministic, high-entropy, carrier-unique salt from JPEG DC coefficients
 * and quantization tables:
 *
 * carrierSalt = SHA-256("ollie/v4.1/carrier-salt/" || C || canonical(QTables) || canonical(DC))
 *
 * Architectural Invariants:
 * - DC coefficients (index 0) and Quantization Tables are NEVER modified during embedding.
 * - Invariant across embedding: cover and stego carrier yield identical carrierSalt.
 * - 100% Big-Endian DataView serialization prevents architecture-dependent endianness mismatches.
 * - Eliminates two-phase bootstrapping and defeats offline fast-cracking oracles.
 */
import { sha256 } from '../cryptography/crypto-provider.js';

export const CARRIER_SALT_PREFIX = 'ollie/v4.1/carrier-salt/';

/**
 * Calculates the canonical carrierSalt for a set of JPEG quantized DCT blocks and quantization tables.
 *
 * @param {Array<Int32Array>} blocks - Quantized DCT blocks in canonical flattenBlocks order (Y, then Cb, then Cr)
 * @param {Array<Uint16Array|Float32Array|Int32Array|Array<number>>} [qTables] - Quantization tables per component
 * @returns {Promise<[Uint8Array|null, Error|null]>} 32-byte salt tuple
 */
export async function calculateCarrierSalt(blocks, qTables = null) {
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
        return [null, new Error('carrier-salt: non-empty blocks array required')];
    }

    const prefixBytes = new TextEncoder().encode(CARRIER_SALT_PREFIX);
    const prefixLen = prefixBytes.length; // 24 bytes

    // Canonical Component Count C in {1, 3}
    const componentCount = (qTables && Array.isArray(qTables) && qTables.length >= 3) ? 3 : 1;
    const tables = (qTables && Array.isArray(qTables) && qTables.length > 0)
        ? qTables
        : [new Uint16Array(64).fill(16)];

    const qTablesByteLen = componentCount * 64 * 2; // 128 bytes per component
    const dcByteLen = blocks.length * 2;            // 2 bytes per block (int16 BE)
    const totalBytes = prefixLen + 1 + qTablesByteLen + dcByteLen;

    const buffer = new Uint8Array(totalBytes);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // 1. Prefix
    buffer.set(prefixBytes, 0);
    let offset = prefixLen;

    // 2. Component count (uint8)
    view.setUint8(offset, componentCount);
    offset += 1;

    // 3. Canonical Quantization Tables (uint16 BE per entry in zigzag order)
    for (let c = 0; c < componentCount; c++) {
        const table = tables[c] || tables[0];
        for (let i = 0; i < 64; i++) {
            const qVal = Math.max(1, Math.min(65535, Math.round(table[i] || 16)));
            view.setUint16(offset, qVal, false);
            offset += 2;
        }
    }

    // 4. Canonical DC Coefficients (int16 BE per block)
    for (let b = 0; b < blocks.length; b++) {
        const blk = blocks[b];
        const dcVal = blk && blk.length > 0 ? blk[0] : 0;
        const clampedDc = Math.max(-32768, Math.min(32767, dcVal));
        view.setInt16(offset, clampedDc, false);
        offset += 2;
    }

    try {
        const digest = await sha256(buffer);
        return [digest, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}
