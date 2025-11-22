import { describe, it, expect } from '../utils/test-runner.js';
import {
    findNextMarker,
    readMarkerSegment,
    parseFileStructure,
    getMarkerName,
    MARKERS
} from '../../src/utils/marker-parser.js';

describe('MarkerParser', () => {
    it('should identify SOI marker (0xFFD8)', () => {
        const data = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
        const result = findNextMarker(data, 0);

        expect(result.marker).toBe(0xFFD8);
        expect(result.offset).toBe(0);
    });

    it('should identify EOI marker (0xFFD9)', () => {
        const data = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
        const result = findNextMarker(data, 2);

        expect(result.marker).toBe(0xFFD9);
        expect(result.offset).toBe(2);
    });

    it('should skip 0xFF 0x00 (byte stuffing)', () => {
        const data = new Uint8Array([0xFF, 0x00, 0xFF, 0xD8]);
        const result = findNextMarker(data, 0);

        expect(result.marker).toBe(0xFFD8);
        expect(result.offset).toBe(2);
    });

    it('should skip 0xFF 0xFF (padding)', () => {
        const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xD8]);
        const result = findNextMarker(data, 0);

        expect(result.marker).toBe(0xFFD8);
        expect(result.offset).toBe(2);
    });

    it('should parse segment length correctly (big-endian)', () => {
        // DQT marker with length 5 (0x00 0x05)
        const data = new Uint8Array([0xFF, 0xDB, 0x00, 0x05, 0x01, 0x02, 0x03]);
        const segment = readMarkerSegment(data, 0);

        expect(segment.type).toBe(0xFFDB);
        expect(segment.data.length).toBe(3); // Length 5 - 2 (length bytes)
        expect(segment.data[0]).toBe(0x01);
        expect(segment.data[1]).toBe(0x02);
        expect(segment.data[2]).toBe(0x03);
    });

    it('should extract DQT segment data', () => {
        const data = new Uint8Array([0xFF, 0xDB, 0x00, 0x04, 0xAA, 0xBB]);
        const segment = readMarkerSegment(data, 0);

        expect(segment.type).toBe(MARKERS.DQT);
        expect(segment.data.length).toBe(2);
        expect(segment.data[0]).toBe(0xAA);
        expect(segment.data[1]).toBe(0xBB);
    });

    it('should extract DHT segment data', () => {
        const data = new Uint8Array([0xFF, 0xC4, 0x00, 0x03, 0xCC]);
        const segment = readMarkerSegment(data, 0);

        expect(segment.type).toBe(MARKERS.DHT);
        expect(segment.data.length).toBe(1);
        expect(segment.data[0]).toBe(0xCC);
    });

    it('should handle standalone markers (no length)', () => {
        const data = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);

        const soi = readMarkerSegment(data, 0);
        expect(soi.type).toBe(MARKERS.SOI);
        expect(soi.data.length).toBe(0);
        expect(soi.nextOffset).toBe(2);

        const eoi = readMarkerSegment(data, 2);
        expect(eoi.type).toBe(MARKERS.EOI);
        expect(eoi.data.length).toBe(0);
        expect(eoi.nextOffset).toBe(4);
    });

    it('should validate marker sequence (SOI must be first)', () => {
        const invalidData = new Uint8Array([0xFF, 0xC0, 0x00, 0x02]);

        let errorThrown = false;
        try {
            parseFileStructure(invalidData);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid JPEG file: missing SOI marker');
        }
        expect(errorThrown).toBe(true);
    });

    it('should handle multiple DQT segments', () => {
        const data = new Uint8Array([
            0xFF, 0xD8, // SOI
            0xFF, 0xDB, 0x00, 0x03, 0xAA, // DQT 1
            0xFF, 0xDB, 0x00, 0x03, 0xBB, // DQT 2
            0xFF, 0xD9  // EOI
        ]);

        const segments = parseFileStructure(data);
        expect(segments.has('DQT')).toBe(true);
        expect(segments.get('DQT').length).toBe(2);
        expect(segments.get('DQT')[0].data[0]).toBe(0xAA);
        expect(segments.get('DQT')[1].data[0]).toBe(0xBB);
    });

    it('should get marker names correctly', () => {
        expect(getMarkerName(0xFFD8)).toBe('SOI');
        expect(getMarkerName(0xFFD9)).toBe('EOI');
        expect(getMarkerName(0xFFC0)).toBe('SOF0');
        expect(getMarkerName(0xFFC4)).toBe('DHT');
        expect(getMarkerName(0xFFDB)).toBe('DQT');
        expect(getMarkerName(0xFFDA)).toBe('SOS');
    });

    it('should handle APP markers', () => {
        expect(getMarkerName(0xFFE0)).toBe('APP0');
        expect(getMarkerName(0xFFE1)).toBe('APP1');
        expect(getMarkerName(0xFFEF)).toBe('APP15');
    });

    it('should handle RST markers', () => {
        expect(getMarkerName(0xFFD0)).toBe('RST0');
        expect(getMarkerName(0xFFD7)).toBe('RST7');
    });

    it('should parse minimal valid JPEG', () => {
        const data = new Uint8Array([
            0xFF, 0xD8, // SOI
            0xFF, 0xD9  // EOI
        ]);

        const segments = parseFileStructure(data);
        expect(segments.has('SOI')).toBe(true);
        expect(segments.has('EOI')).toBe(true);
    });

    it('should throw error on invalid segment length', () => {
        const data = new Uint8Array([0xFF, 0xDB, 0x00, 0x01]); // Length < 2

        let errorThrown = false;
        try {
            readMarkerSegment(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid segment length: 1');
        }
        expect(errorThrown).toBe(true);
    });

    it('should throw error on incomplete segment', () => {
        const data = new Uint8Array([0xFF, 0xDB, 0x00, 0x05, 0xAA]); // Claims 5 bytes but only has 1

        let errorThrown = false;
        try {
            readMarkerSegment(data, 0);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Incomplete segment data');
        }
        expect(errorThrown).toBe(true);
    });
});
