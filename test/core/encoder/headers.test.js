import { describe, it, expect } from '../../utils/test-runner.js';
import { JpegEncoder } from '../../../src/core/jpeg-encoder.js';
import { getScaledQuantizationTables } from '../../../src/core/encoder/quantization.js';

const defaultQTables = getScaledQuantizationTables(50);
describe('JPEG Headers', () => {
    it('should write correct SOI marker', () => {
        const encoder = new JpegEncoder();
        encoder.writeHeaders(null, 100, 100, defaultQTables);
        const headers = encoder.headers;

        expect(headers[0]).toBe(0xFF);
        expect(headers[1]).toBe(0xD8);
    });

    it('should write correct APP0 (JFIF) marker', () => {
        const encoder = new JpegEncoder();
        encoder.writeHeaders(null, 100, 100, defaultQTables);
        const headers = encoder.headers;

        let idx = 2; 
        expect(headers[idx]).toBe(0xFF);
        expect(headers[idx + 1]).toBe(0xE0);

        expect(headers[idx + 2]).toBe(0x00);
        expect(headers[idx + 3]).toBe(0x10);

        expect(headers[idx + 4]).toBe(0x4A); 
        expect(headers[idx + 5]).toBe(0x46); 
        expect(headers[idx + 6]).toBe(0x49); 
        expect(headers[idx + 7]).toBe(0x46); 
        expect(headers[idx + 8]).toBe(0x00); 
    });

    it('should write DQT markers', () => {
        const encoder = new JpegEncoder();
        encoder.writeHeaders(null, 100, 100, defaultQTables);
        const headers = encoder.headers;

        let dqtCount = 0;
        for (let i = 0; i < headers.length - 1; i++) {
            if (headers[i] === 0xFF && headers[i + 1] === 0xDB) {
                dqtCount++;

                const len = (headers[i + 2] << 8) | headers[i + 3];
                expect(len).toBe(67);
            }
        }
        
        expect(dqtCount).toBeGreaterThanOrEqual(2);
    });

    it('should write correct SOF0 marker', () => {
        const encoder = new JpegEncoder();
        const width = 640;
        const height = 480;
        encoder.writeHeaders(null, width, height, defaultQTables);
        const headers = encoder.headers;

        let sofIdx = -1;
        for (let i = 0; i < headers.length - 1; i++) {
            if (headers[i] === 0xFF && headers[i + 1] === 0xC0) {
                sofIdx = i;
                break;
            }
        }
        expect(sofIdx).not.toBe(-1);

        expect(headers[sofIdx + 2]).toBe(0x00);
        expect(headers[sofIdx + 3]).toBe(0x11);

        expect(headers[sofIdx + 4]).toBe(8);

        const h = (headers[sofIdx + 5] << 8) | headers[sofIdx + 6];
        expect(h).toBe(height);

        const w = (headers[sofIdx + 7] << 8) | headers[sofIdx + 8];
        expect(w).toBe(width);

        expect(headers[sofIdx + 9]).toBe(3);
    });

    it('should write DHT markers', () => {
        const encoder = new JpegEncoder();
        encoder.writeHeaders(null, 100, 100, defaultQTables);
        const headers = encoder.headers;

        let dhtCount = 0;
        for (let i = 0; i < headers.length - 1; i++) {
            if (headers[i] === 0xFF && headers[i + 1] === 0xC4) {
                dhtCount++;
            }
        }

        expect(dhtCount).toBeGreaterThanOrEqual(2);
    });

});
