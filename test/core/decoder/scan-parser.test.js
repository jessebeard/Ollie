import { describe, it, expect } from '../../utils/test-runner.js';
import { parseScanHeader } from '../../../src/core/decoder/scan-parser.js';

describe('ScanHeaderParser', () => {
    it('should parse number of components in scan (Ns)', () => {
        
        const data1 = new Uint8Array([
            1,           
            1, 0x00,     
            0, 63, 0     
        ]);
        expect(parseScanHeader(data1).numComponents).toBe(1);

        const data3 = new Uint8Array([
            3,           
            1, 0x00,     
            2, 0x11,     
            3, 0x11,     
            0, 63, 0
        ]);
        expect(parseScanHeader(data3).numComponents).toBe(3);
    });

    it('should parse component selectors (Cs)', () => {
        const data = new Uint8Array([
            3,
            1, 0x00,     
            2, 0x11,     
            3, 0x11,     
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
            1, 0x00,     
            2, 0x11,     
            0, 63, 0
        ]);

        const scan = parseScanHeader(data);
        expect(scan.components[0].dcTableId).toBe(0);
        expect(scan.components[1].dcTableId).toBe(1);
    });

    it('should parse AC table selectors (Ta)', () => {
        const data = new Uint8Array([
            2,
            1, 0x01,     
            2, 0x12,     
            0, 63, 0
        ]);

        const scan = parseScanHeader(data);
        expect(scan.components[0].acTableId).toBe(1);
        expect(scan.components[1].acTableId).toBe(2);
    });

    it('should parse spectral selection (Ss, Se)', () => {
        const data = new Uint8Array([
            1, 1, 0x00,
            0, 63,       
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
            0x00         
        ]);

        const scan = parseScanHeader(data);
        expect(scan.Ah).toBe(0);
        expect(scan.Al).toBe(0);
    });

    it('should parse progressive parameters correctly', () => {
        const data = new Uint8Array([
            1, 1, 0x00,
            0, 5,        
            0x10         
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
            1, 0x40,     
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
            1, 0x04,     
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
            5,           
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
            3,           
            1, 0x00,     
            0, 0         
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
            1, 0x00,     
            2, 0x11,     
            3, 0x11,     
            0, 63, 0
        ]);

        const scan = parseScanHeader(data);

        expect(scan.components[0].dcTableId).toBe(0);
        expect(scan.components[0].acTableId).toBe(0);

        expect(scan.components[1].dcTableId).toBe(1);
        expect(scan.components[1].acTableId).toBe(1);
        expect(scan.components[2].dcTableId).toBe(1);
        expect(scan.components[2].acTableId).toBe(1);
    });
});
