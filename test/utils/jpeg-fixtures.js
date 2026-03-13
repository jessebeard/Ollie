"use strict";

/**
 * JPEG Fixtures for Testing
 * 
 * Provides utility functions to create valid-enough mock JPEGs that can be
 * parsed by the JpegDecoder for capacity analysis and other tests.
 */

/**
 * Creates a mock JPEG with minimal valid segments.
 * 
 * @param {string} name - File name
 * @param {number} size - Total size (will be padded if needed)
 * @returns {Object} Mock File-like object
 */
export function createMockJpeg(name, size = 1000) {
    // SOI: FF D8
    const soi = new Uint8Array([0xFF, 0xD8]);

    // DQT: FF DB, length 00 43 (67 bytes)
    const dqt = new Uint8Array(2 + 2 + 1 + 64);
    dqt[0] = 0xFF; dqt[1] = 0xDB;
    dqt[2] = 0x00; dqt[3] = 0x43;
    dqt[4] = 0x00; // Precision 0, ID 0
    dqt.fill(0x10, 5);

    // DHT: FF C4
    // DC Table 0: 1 code of length 1, value 0 (DC=0)
    const dhtDC = new Uint8Array(2 + 2 + 1 + 16 + 1);
    dhtDC[0] = 0xFF; dhtDC[1] = 0xC4;
    dhtDC[2] = 0x00; dhtDC[3] = 0x14;
    dhtDC[4] = 0x00; // TC 0, TH 0
    dhtDC[5] = 0x01; // BITS[1]
    dhtDC[21] = 0x00; // HUFFVAL[0]

    // AC Table 0: 1 code of length 1, value 0 (EOB)
    const dhtAC = new Uint8Array(2 + 2 + 1 + 16 + 1);
    dhtAC[0] = 0xFF; dhtAC[1] = 0xC4;
    dhtAC[2] = 0x00; dhtAC[3] = 0x14;
    dhtAC[4] = 0x10; // TC 1, TH 0
    dhtAC[5] = 0x01; // BITS[1]
    dhtAC[21] = 0x00; // HUFFVAL[0]

    // SOF0: FF C0, length 00 11 (17 bytes)
    const sof = new Uint8Array([
        0xFF, 0xC0, 
        0x00, 0x11, 
        0x08, 0x00, 0x08, 0x00, 0x08,
        0x03, 
        0x01, 0x11, 0x00,
        0x02, 0x11, 0x00,
        0x03, 0x11, 0x00
    ]);

    // SOS: FF DA, length 00 0C (12 bytes)
    const sos = new Uint8Array([
        0xFF, 0xDA,
        0x00, 0x0C,
        0x03,
        0x01, 0x00, // Y: DC 0, AC 0
        0x02, 0x00, // Cb: DC 0, AC 0
        0x03, 0x00, // Cr: DC 0, AC 0
        0x00, 0x3F, 0x00
    ]);

    // Scan Data: 
    // DHT says code '0' (1 bit) is value 0.
    // In DC, value 0 means diff=0.
    // In AC, value 0 means EOB.
    // So if we have all 0 bits, it decodes DC=0, then EOB.
    const scanData = new Uint8Array([0x00, 0x00, 0x00]); // 24 zero bits
    const eoi = new Uint8Array([0xFF, 0xD9]);

    const segments = [soi, dqt, dhtDC, dhtAC, sof, sos, scanData, eoi];
    const totalSegmentsSize = segments.reduce((sum, s) => sum + s.length, 0);
    const finalSize = Math.max(size, totalSegmentsSize);
    
    const bytes = new Uint8Array(finalSize);
    let offset = 0;
    for (const s of segments) {
        bytes.set(s, offset);
        offset += s.length;
    }

    bytes[finalSize - 2] = 0xFF;
    bytes[finalSize - 1] = 0xD9;

    return {
        name,
        size: finalSize,
        arrayBuffer: async () => bytes.buffer,
        bytes
    };
}
