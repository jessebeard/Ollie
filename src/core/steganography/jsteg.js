/**
 * Jsteg Steganography Implementation
 * 
 * Implements the Jsteg algorithm for hiding data in JPEG coefficients.
 * Jsteg embeds data in the Least Significant Bit (LSB) of non-zero quantized DCT coefficients.
 * It skips:
 * - DC coefficients (index 0 of each block) to preserve overall luminance/color.
 * - Coefficients with value 0 or 1 (though some variants use 1, standard Jsteg usually skips 0 and 1 to avoid ambiguity, but simple LSB replacement on non-zeros is common. Let's stick to: skip 0s, and maybe skip 1s if it causes issues, but usually just skip 0s is the definition of "non-zero". Wait, Jsteg specifically skips 0 and 1?
 * 
 * Actually, the classic Jsteg algorithm:
 * - Sequential embedding.
 * - Skips DC coefficients.
 * - Skips AC coefficients that are 0 or 1.
 * - Replaces LSB of other coefficients.
 * 
 * However, skipping 1s reduces capacity significantly. A simpler variant is "LSB of non-zeros".
 * Let's implement "LSB of non-zeros" first (skipping only 0). If we encounter issues, we can refine.
 * Actually, let's stick to skipping 0s only for max capacity for now, unless we find a reason not to.
 * 
 * Data Format:
 * [Length (32-bit BE)][Data Payload]
 */
export class Jsteg {
    /**
     * Embeds data into the provided blocks.
     * Modifies the blocks in-place.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks - Array of 8x8 blocks (64 elements each)
     * @param {Uint8Array} data - Data to embed
     * @returns {boolean} True if successful, false if data didn't fit
     */
    static embed(blocks, data) {
        const totalBits = (data.length + 4) * 8; // +4 bytes for length header
        let bitsEmbedded = 0;

        // Prepare data stream with length header
        const dataWithHeader = new Uint8Array(data.length + 4);
        const view = new DataView(dataWithHeader.buffer);
        view.setUint32(0, data.length, false); // Big Endian length
        dataWithHeader.set(data, 4);

        let byteIndex = 0;
        let bitIndex = 0;

        for (const block of blocks) {
            // Skip DC (index 0)
            for (let i = 1; i < 64; i++) {
                if (byteIndex >= dataWithHeader.length) {
                    return true; // Done
                }

                const val = block[i];

                // Skip zeros (and potentially 1s if we wanted strict Jsteg, but let's try just skipping 0s)
                // Actually, let's skip 0s.
                if (val === 0) continue;

                // Get current bit to embed
                const bit = (dataWithHeader[byteIndex] >> (7 - bitIndex)) & 1;

                // Embed bit into LSB
                // If val is even and bit is 1 -> val + 1
                // If val is even and bit is 0 -> val
                // If val is odd and bit is 1 -> val
                // If val is odd and bit is 0 -> val - 1 (or +1? usually we want to minimize change)

                // Standard LSB replacement:
                // val = (val & ~1) | bit;
                // But wait, if val is negative?
                // -3 (1111...1101) & ~1 = -4 (1111...1100). | 1 = -3. Correct.
                // -2 (1111...1110) & ~1 = -2. | 1 = -1. Correct.
                // So bitwise ops work on signed integers in JS (treated as 32-bit two's complement).

                // However, we must ensure we don't turn a non-zero into a zero!
                // If val is 1 and we embed 0 -> 0. This destroys the carrier.
                // If val is -1 and we embed 0 -> -2. Safe.
                // So if val is 1, we CANNOT embed 0 if we simply use LSB replacement.
                // This is why Jsteg skips 1s (and -1s usually).

                // Let's implement strict Jsteg: Skip 0, 1, -1.
                // Or, handle 1/-1 specially?
                // If we skip 1/-1, we lose a LOT of capacity in JPEG (most ACs are 1/-1).

                // Alternative: F5 algorithm? Too complex for now.
                // Alternative: "LSB matching" or +/-1 embedding?
                // If val is 1 and we want 0, change to 2? Or 0 (but 0 is skipped by decoder)?
                // If we change 1 to 0, the decoder will skip it and miss the bit.
                // So we must NEVER produce a 0.

                // Strategy:
                // If val is 1 and bit is 0 -> change to 2? (Distortion +1)
                // If val is -1 and bit is 0 -> change to -2? (Distortion -1)
                // If val is even, LSB replacement is fine (never becomes 0).
                // If val is odd (e.g. 3), LSB replacement makes it 2 or 3. Safe.

                // So the only danger is 1 and -1.
                // If we allow changing 1->2 and -1->-2, we preserve the "non-zero" property.
                // But wait, decoder just reads LSB.
                // If encoder: 1 (odd) -> embed 0 -> becomes 0? No, we need it to be even.
                // 0 is even. But 0 is skipped.
                // So 1 -> embed 0 must become 2 (even, non-zero).
                // -1 (odd) -> embed 0 must become -2 (even, non-zero).

                // Decoder:
                // Reads 2 (even) -> extracts 0. Correct.
                // Reads -2 (even) -> extracts 0. Correct.

                // What about 1 -> embed 1? Remains 1.
                // Decoder reads 1 (odd) -> extracts 1. Correct.

                // So the rule is:
                // If val is 1 or -1:
                //   If bit match LSB (1), keep it.
                //   If bit mismatch (0), change magnitude to 2 (1->2, -1->-2).
                // For all other non-zeros:
                //   Standard LSB replacement.

                // Let's verify "other non-zeros" don't become 0.
                // 2 -> embed 0 -> 2.
                // 2 -> embed 1 -> 3.
                // -2 -> embed 0 -> -2.
                // -2 -> embed 1 -> -1 (Wait, -1 is safe to read, just dangerous to write to 0).
                // So yes, standard LSB works for |val| > 1.

                // Implementation:
                if (val === 1) {
                    if (bit === 0) block[i] = 2;
                } else if (val === -1) {
                    if (bit === 0) block[i] = -2;
                } else {
                    block[i] = (val & ~1) | bit;
                }

                bitsEmbedded++;
                bitIndex++;
                if (bitIndex === 8) {
                    bitIndex = 0;
                    byteIndex++;
                }
            }
        }

        return false; // Ran out of space
    }

    /**
     * Extracts data from the provided blocks.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks - Array of 8x8 blocks
     * @returns {Uint8Array|null} Extracted data or null if invalid
     */
    static extract(blocks) {
        // console.log(`Jsteg.extract: Processing ${blocks.length} blocks`);
        let length = 0;
        let lengthBits = 0;
        let data = null;
        let byteIndex = 0;
        let bitIndex = 0;
        let totalBitsRead = 0;

        // State machine: 0=Reading Length, 1=Reading Data
        let state = 0;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                const val = block[i];
                if (val === 0) continue;

                const bit = val & 1;
                totalBitsRead++;

                if (state === 0) {
                    // Reading Length (32 bits)
                    length = (length << 1) | bit;
                    lengthBits++;
                    if (lengthBits === 32) {
                        // console.log(`Jsteg.extract: Raw length value before unsigned conversion: ${length}`);
                        length = length >>> 0; // Treat as unsigned 32-bit integer
                        // console.log(`Jsteg.extract: Length header read: ${length}`);

                        // Sanity check length
                        if (length > 100 * 1024 * 1024) { // 100MB limit sanity
                            console.warn('Jsteg: Invalid length detected:', length);
                            return null;
                        }
                        data = new Uint8Array(length);
                        if (length === 0) return data;
                        state = 1;
                    }
                } else {
                    // Reading Data
                    if (byteIndex < length) {
                        data[byteIndex] = (data[byteIndex] << 1) | bit;
                        bitIndex++;
                        if (bitIndex === 8) {
                            bitIndex = 0;
                            byteIndex++;
                            if (byteIndex === length) {
                                // console.log(`Jsteg.extract: Successfully read ${length} bytes`);
                                return data;
                            }
                        }
                    }
                }
            }
        }

        // console.log(`Jsteg.extract: Ran out of blocks. Read ${byteIndex} bytes, ${bitIndex} bits. Total bits read: ${totalBitsRead}`);
        return null;
    }

    /**
     * Calculates the maximum capacity in bytes for the given blocks.
     * 
     * @param {Array<Int32Array|Float32Array>} blocks 
     * @returns {number} Capacity in bytes
     */
    static calculateCapacity(blocks) {
        let capacityBits = 0;
        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                if (block[i] !== 0) capacityBits++;
            }
        }
        // Subtract 32 bits for header
        return Math.max(0, Math.floor((capacityBits - 32) / 8));
    }
}
