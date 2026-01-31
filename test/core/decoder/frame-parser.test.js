import { describe, it, expect } from '../../utils/test-runner.js';
import { parseFrameHeader } from '../../../src/core/decoder/frame-parser.js';

describe('FrameHeaderParser', () => {
    it('should parse image width (X)', () => {
        
        const data = new Uint8Array([
            8,           
            0, 100,      
            0, 200,      
            1,           
            1, 0x11, 0   
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.width).toBe(200);
    });

    it('should parse image height (Y)', () => {
        const data = new Uint8Array([
            8,           
            0, 150,      
            0, 100,      
            1,           
            1, 0x11, 0
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.height).toBe(150);
    });

    it('should parse sample precision (P, typically 8)', () => {
        const data = new Uint8Array([
            8,           
            0, 100,
            0, 100,
            1,
            1, 0x11, 0
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.precision).toBe(8);
    });

    it('should parse number of components (Nf: 1=grayscale, 3=color)', () => {
        
        const gray = new Uint8Array([8, 0, 100, 0, 100, 1, 1, 0x11, 0]);
        expect(parseFrameHeader(gray).numComponents).toBe(1);

        const color = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,  
            2, 0x11, 1,  
            3, 0x11, 1   
        ]);
        expect(parseFrameHeader(color).numComponents).toBe(3);
    });

    it('should parse component IDs (C)', () => {
        const data = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,
            2, 0x11, 1,
            3, 0x11, 1
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.components[0].id).toBe(1);
        expect(frame.components[1].id).toBe(2);
        expect(frame.components[2].id).toBe(3);
    });

    it('should parse sampling factors (H and V)', () => {
        const data = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x21, 0,  
            2, 0x11, 0,  
            3, 0x11, 0   
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.components[0].hSampling).toBe(2);
        expect(frame.components[0].vSampling).toBe(1);
        expect(frame.components[1].hSampling).toBe(1);
        expect(frame.components[1].vSampling).toBe(1);
    });

    it('should parse quantization table selectors (Tq)', () => {
        const data = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,  
            2, 0x11, 1,  
            3, 0x11, 1   
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.components[0].quantTableId).toBe(0);
        expect(frame.components[1].quantTableId).toBe(1);
        expect(frame.components[2].quantTableId).toBe(1);
    });

    it('should calculate MCU dimensions from max sampling factors', () => {
        
        const data = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,  
            2, 0x11, 1,  
            3, 0x11, 1   
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.maxHSampling).toBe(2);
        expect(frame.maxVSampling).toBe(2);
        expect(frame.mcuWidth).toBe(16);  
        expect(frame.mcuHeight).toBe(16); 
    });

    it('should validate baseline constraints (P=8)', () => {
        const data = new Uint8Array([
            12,          
            0, 100, 0, 100, 1, 1, 0x11, 0
        ]);

        let errorThrown = false;
        try {
            parseFrameHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Unsupported sample precision: 12 (baseline requires 8)');
        }
        expect(errorThrown).toBe(true);
    });

    it('should validate image dimensions', () => {
        const data = new Uint8Array([
            8,
            0, 0,        
            0, 100,
            1, 1, 0x11, 0
        ]);

        let errorThrown = false;
        try {
            parseFrameHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid image dimensions: 100x0');
        }
        expect(errorThrown).toBe(true);
    });

    it('should validate number of components', () => {
        const data = new Uint8Array([
            8, 0, 100, 0, 100,
            4,           
            1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0
        ]);

        let errorThrown = false;
        try {
            parseFrameHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Unsupported number of components: 4 (expected 1 or 3)');
        }
        expect(errorThrown).toBe(true);
    });

    it('should throw error on incomplete data', () => {
        const data = new Uint8Array([8, 0, 100, 0, 100, 3]); 

        let errorThrown = false;
        try {
            parseFrameHeader(data);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Incomplete SOF0 component data');
        }
        expect(errorThrown).toBe(true);
    });

    it('should calculate MCU counts correctly', () => {
        
        const data = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,
            2, 0x11, 1,
            3, 0x11, 1
        ]);

        const frame = parseFrameHeader(data);
        expect(frame.mcuCols).toBe(7);  
        expect(frame.mcuRows).toBe(7);  
    });
});
