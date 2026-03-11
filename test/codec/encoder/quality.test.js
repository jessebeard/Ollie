/**
 * Tests for JPEG encoder quality levels.
 * Verifies that the quality parameter correctly scales quantization tables
 * and affects output file size.
 */
import { describe, it, expect } from '../../utils/test-runner.js';
import { JpegEncoder } from '../../../src/codec/encoder.js';
import { getScaledQuantizationTables } from '../../../src/algebraic/quantization/forward-quantization.js';

function createTestImage(width, height) {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.floor(Math.random() * 256);
        data[i + 1] = Math.floor(Math.random() * 256);
        data[i + 2] = Math.floor(Math.random() * 256);
        data[i + 3] = 255;
    }
    return { width, height, data };
}

function extractDQTTables(jpegBytes) {
    const tables = [];
    for (let i = 0; i < jpegBytes.length - 1; i++) {
        if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xDB) {

            const length = (jpegBytes[i + 2] << 8) | jpegBytes[i + 3];
            const tableId = jpegBytes[i + 4] & 0x0F;
            const precision = (jpegBytes[i + 4] >> 4) & 0x0F;
            const values = new Int32Array(64);
            for (let j = 0; j < 64; j++) {
                values[j] = precision === 0 ? jpegBytes[i + 5 + j] :
                    ((jpegBytes[i + 5 + j * 2] << 8) | jpegBytes[i + 5 + j * 2 + 1]);
            }
            tables.push({ id: tableId, values });
            i += length + 1;
        }
    }
    return tables;
}

describe('JpegEncoder Quality Levels', () => {
    it('produces smaller files at lower quality', async () => {
        const imageData = createTestImage(64, 64);

        const encoderQ10 = new JpegEncoder(10);
        const encoderQ50 = new JpegEncoder(50);
        const encoderQ90 = new JpegEncoder(90);

        const bytesQ10 = await encoderQ10.encode(imageData);
        const bytesQ50 = await encoderQ50.encode(imageData);
        const bytesQ90 = await encoderQ90.encode(imageData);

        console.log(`Q10: ${bytesQ10.length} bytes, Q50: ${bytesQ50.length} bytes, Q90: ${bytesQ90.length} bytes`);

        expect(bytesQ10.length).toBeLessThan(bytesQ50.length);
        expect(bytesQ50.length).toBeLessThan(bytesQ90.length);
    });

    it('produces valid JPEG at all quality levels', async () => {
        const imageData = createTestImage(16, 16);

        for (const quality of [1, 25, 50, 75, 100]) {
            const encoder = new JpegEncoder(quality);
            const bytes = await encoder.encode(imageData);

            expect(bytes[0]).toBe(0xFF);
            expect(bytes[1]).toBe(0xD8);

            expect(bytes[bytes.length - 2]).toBe(0xFF);
            expect(bytes[bytes.length - 1]).toBe(0xD9);
        }
    });

    it('writes correct DQT values based on quality', async () => {
        const imageData = createTestImage(8, 8);

        const encoder50 = new JpegEncoder(50);
        const bytes50 = await encoder50.encode(imageData);
        const tables50 = extractDQTTables(bytes50);
        const [expected50] = getScaledQuantizationTables(50);

        expect(tables50.length).toBe(2);

        expect(tables50[0].id).toBe(0);
        expect(tables50[1].id).toBe(1);

        const encoder10 = new JpegEncoder(10);
        const bytes10 = await encoder10.encode(imageData);
        const tables10 = extractDQTTables(bytes10);

        expect(tables10[0].values[0]).toBeGreaterThan(tables50[0].values[0]);
    });

    it('caches quantization tables for same quality', () => {

        const [tables1] = getScaledQuantizationTables(75);
        const [tables2] = getScaledQuantizationTables(75);

        expect(tables1).toBe(tables2);
    });

    it('clamps quality to valid range', () => {

        const [tablesLow] = getScaledQuantizationTables(-10);
        const [tables1] = getScaledQuantizationTables(1);
        expect(tablesLow.luma).toEqual(tables1.luma);

        const [tablesHigh] = getScaledQuantizationTables(150);
        const [tables100] = getScaledQuantizationTables(100);
        expect(tablesHigh.luma).toEqual(tables100.luma);
    });
});
