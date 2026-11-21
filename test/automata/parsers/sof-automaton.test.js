import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { parseFrameHeader } from '../../../src/automata/parsers/sof-automaton.js';

describe('FrameHeaderParser', () => {
    it('should parse image width (X)', () => {

        const data = new Uint8Array([
            8,
            0, 100,
            0, 200,
            1,
            1, 0x11, 0
        ]);

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
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

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
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

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
        expect(frame.precision).toBe(8);
    });

    it('should parse number of components (Nf: 1=grayscale, 3=color)', () => {

        const gray = new Uint8Array([8, 0, 100, 0, 100, 1, 1, 0x11, 0]);
        const [grayResult] = parseFrameHeader(gray);
        expect(grayResult.numComponents).toBe(1);

        const color = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,
            2, 0x11, 1,
            3, 0x11, 1
        ]);
        const [colorResult] = parseFrameHeader(color);
        expect(colorResult.numComponents).toBe(3);
    });

    it('should parse component IDs (C)', () => {
        const data = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,
            2, 0x11, 1,
            3, 0x11, 1
        ]);

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
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

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
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

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
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

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
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

        const [, err] = parseFrameHeader(data);
        expect(err).toBeDefined();
        expect(err.message).toBe('Unsupported sample precision: 12 (baseline requires 8)');
    });

    it('should validate image dimensions', () => {
        const data = new Uint8Array([
            8,
            0, 0,
            0, 100,
            1, 1, 0x11, 0
        ]);

        const [, err] = parseFrameHeader(data);
        expect(err).toBeDefined();
        expect(err.message).toBe('Invalid image dimensions: 100x0');
    });

    it('should validate number of components', () => {
        const data = new Uint8Array([
            8, 0, 100, 0, 100,
            4,
            1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0
        ]);

        const [, err] = parseFrameHeader(data);
        expect(err).toBeDefined();
        expect(err.message).toBe('Unsupported number of components: 4 (expected 1 or 3)');
    });

    it('should throw error on incomplete data', () => {
        const data = new Uint8Array([8, 0, 100, 0, 100, 3]);

        const [, err] = parseFrameHeader(data);
        expect(err).toBeDefined();
        expect(err.message).toBe('Incomplete SOF0 component data');
    });

    it('should calculate MCU counts correctly', () => {

        const data = new Uint8Array([
            8, 0, 100, 0, 100, 3,
            1, 0x22, 0,
            2, 0x11, 1,
            3, 0x11, 1
        ]);

        const [frame, err] = parseFrameHeader(data);
        expect(err).toEqual(null);
        expect(frame.mcuCols).toBe(7);
        expect(frame.mcuRows).toBe(7);
    });

    describe('PBT & Structural Validation', () => {
        it('Property: parseFrameHeader extracts exact arbitrary 16-bit dimensions', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 65535), Arbitrary.integer(1, 65535)],
                (w, h) => {
                    const data = new Uint8Array([
                        8,
                        (h >> 8) & 0xFF, h & 0xFF,
                        (w >> 8) & 0xFF, w & 0xFF,
                        1,
                        1, 0x11, 0
                    ]);

                    const [frame, err] = parseFrameHeader(data);
                    expect(err).toBe(null);
                    expect(frame.width).toBe(w);
                    expect(frame.height).toBe(h);
                    expect(frame.precision).toBe(8);
                    expect(frame.numComponents).toBe(1);
                },
                50
            );
        });

        it('Property: duplicate component IDs are unconditionally rejected with typed error', async () => {
            await assertProperty(
                [Arbitrary.integer(1, 255)],
                (dupId) => {
                    // 3 components where 2 share the exact duplicate ID
                    const data = new Uint8Array([
                        8, 0, 100, 0, 100, 3,
                        dupId, 0x22, 0,
                        dupId, 0x11, 1,
                        (dupId + 1) & 0xFF, 0x11, 1
                    ]);

                    const [frame, err] = parseFrameHeader(data);
                    expect(frame).toBe(null);
                    expect(err instanceof Error).toBe(true);
                    expect(err.message).toContain('Duplicate component ID');
                },
                50
            );
        });
    });
});
