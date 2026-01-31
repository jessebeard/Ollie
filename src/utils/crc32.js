/**
 * CRC32 Checksum Utility
 * 
 * Uses optimized lookup table implementation.
 */

let crcTable = null;

function buildTable() {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
        }
        crcTable[i] = crc >>> 0;
    }
}

/**
 * Calculate CRC32 checksum of data.
 * 
 * @param {Uint8Array} data 
 * @returns {number} Unsigned 32-bit CRC32 value
 */
export function crc32(data) {
    if (!crcTable) buildTable();

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        const index = (crc ^ data[i]) & 0xFF;
        crc = (crcTable[index] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
