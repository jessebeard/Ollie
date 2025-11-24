import { describe, it, expect } from '../../utils/test-runner.js';
import { parseScanHeader } from '../../../src/core/decoder/scan-parser.js';

describe('ScanHeaderParser', () => {
    it('should parse number of components in scan (Ns)', () => {
        // Single component scan
        const data1 = new Uint8Array([
            1,           // Ns = 1
            1, 0x00,     // Component 1, DC=0, AC=0
            0, 63, 0     // Ss=0, Se=63, Ah=0, Al=0
        ]);
        expect(parseScanHeader(data1).numComponents).toBe(1);

        // Three component scan
        const data3 = new Uint8Array([
            3,           // Ns = 3
            1, 0x00,     // Component 1
            2, 0x11,     // Component 2
            3, 0x11,     // Component 3
            0, 63, 0
        ]);
        expect(parseScanHeader(data3).numComponents).toBe(3);
    });

    it('should parse component selectors (Cs)', () => {
        const data = new Uint8Array([
            3,
            1, 0x00,     // Cs = 1
            2, 0x11,     // Cs = 2
            3, 0x11,     // Cs = 3
            0, 63, 0
        ]);

        const scan = parseScanHeader(data);
        expect(scan.components[0].selector).toBe(1);
        expect(scan.components[1].selector).toBe(2);
        expect(scan.components[2].selector).toBe(3);
    });

    it('should parse DC table selectors (Td)', () => {
        const data = new Uint8Array([
            2,
            1, 0x00,     // DC table = 0
            2, 0x11,     // DC table = 1
            0, 63, 0
        ]);

        const scan = parseScanHeader(data);
        expect(scan.components[0].dcTableId).toBe(0);
        expect(scan.components[1].dcTableId).toBe(1);
    });

    it('should parse AC table selectors (Ta)', () => {
        const data = new Uint8Array([
            2,
            1, 0x01,     // AC table = 1
            2, 0x12,     // AC table = 2
            0, 63, 0
        ]);

        const scan = parseScanHeader(data);
        expect(scan.components[0].acTableId).toBe(1);
        expect(scan.components[1].acTableId).toBe(2);
    });

    it('should parse spectral selection (Ss, Se)', () => {
        const data = new Uint8Array([
            1, 1, 0x00,
            0, 63,       // Ss=0, Se=63 (sequential)
            0
        ]);

        const scan = parseScanHeader(data);
        expect(scan.Ss).toBe(0);
        expect(scan.Se).toBe(63);
    });

    it('should parse successive approximation (Ah, Al)', () => {
        const data = new Uint8Array([
            1, 1, 0x00,
            0, 63,
            0x00         // Ah=0, Al=0 (sequential)
        ]);

        const scan = parseScanHeader(data);
        expect(scan.Ah).toBe(0);
        expect(scan.Al).toBe(0);
    });

    it('should parse progressive parameters correctly', () => {
        const data = new Uint8Array([
            1, 1, 0x00,
            0, 5,        // Se=5 (progressive)
            0x10         // Ah=1 (progressive)
        ]);

        const scan = parseScanHeader(data);
        expect(scan.Ss).toBe(0);
        expect(scan.Se).toBe(5);
        expect(scan.Ah).toBe(1);
        expect(scan.Al).toBe(0);
    });

    it('should validate DC table ID range', () => {
        const data = new Uint8Array([
            1,
            1, 0x40,     // DC table = 4 (invalid)
            0, 63, 0
        ]);

        let errorThrown = false;
        try {
            parseScanHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid DC table ID: 4');
        }
        expect(errorThrown).toBe(true);
    });

    it('should validate AC table ID range', () => {
        const data = new Uint8Array([
            1,
            1, 0x04,     // AC table = 4 (invalid)
            0, 63, 0
        ]);

        let errorThrown = false;
        try {
            parseScanHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid AC table ID: 4');
        }
        expect(errorThrown).toBe(true);
    });

    it('should validate number of components range', () => {
        const data = new Uint8Array([
            5,           // Ns = 5 (invalid)
            1, 0, 2, 0, 3, 0, 4, 0, 5, 0,
            0, 63, 0
        ]);

        let errorThrown = false;
        try {
            parseScanHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid number of components in scan: 5');
        }
        expect(errorThrown).toBe(true);
    });

    it('should throw error on incomplete data', () => {
        const data = new Uint8Array([
            3,           // Claims 3 components
            1, 0x00,     // Only 1 component provided (need 2 more)
            0, 0         // Padding to pass initial length check
        ]);

        let errorThrown = false;
        try {
            parseScanHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Incomplete SOS component data');
        }
        expect(errorThrown).toBe(true);
    });

    it('should map components to Huffman tables correctly', () => {
        const data = new Uint8Array([
            3,
            1, 0x00,     // Component 1: DC=0, AC=0
            2, 0x11,     // Component 2: DC=1, AC=1
            3, 0x11,     // Component 3: DC=1, AC=1
            0, 63, 0
        ]);

        const scan = parseScanHeader(data);

        // Component 1 uses DC table 0, AC table 0
        expect(scan.components[0].dcTableId).toBe(0);
        expect(scan.components[0].acTableId).toBe(0);

        // Components 2 and 3 use DC table 1, AC table 1
        expect(scan.components[1].dcTableId).toBe(1);
        expect(scan.components[1].acTableId).toBe(1);
        expect(scan.components[2].dcTableId).toBe(1);
        expect(scan.components[2].acTableId).toBe(1);
    });
});
