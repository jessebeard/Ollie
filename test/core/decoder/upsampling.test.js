import { describe, it, expect } from '../../utils/test-runner.js';
import { upsampleNearest, upsampleBilinear, upsampleChroma } from '../../../src/core/decoder/upsampling.js';

describe('Chroma Upsampling', () => {
    it('should upsample 2x2 to 4x4 using nearest neighbor', () => {
        const input = new Float32Array([1, 2, 3, 4]);
        const result = upsampleNearest(input, 2, 2, 4, 4);

        expect(result.length).toBe(16);
        // Each input pixel should be duplicated 2x2
        expect(result[0]).toBe(1);
        expect(result[1]).toBe(1);
        expect(result[4]).toBe(1);
        expect(result[5]).toBe(1);
    });

    it('should upsample 2x2 to 4x4 using bilinear interpolation', () => {
        const input = new Float32Array([0, 100, 0, 100]);
        const result = upsampleBilinear(input, 2, 2, 4, 4);

        expect(result.length).toBe(16);
        // Corners should match input
        expect(result[0]).toBe(0);
        expect(result[3]).toBe(100);
        expect(result[12]).toBe(0);
        expect(result[15]).toBe(100);
    });

    it('should handle 4:2:0 upsampling (2x horizontal, 2x vertical)', () => {
        const input = new Float32Array([128, 128, 128, 128]);
        const result = upsampleBilinear(input, 2, 2, 4, 4);

        expect(result.length).toBe(16);
        // Uniform input should produce uniform output
        for (let i = 0; i < 16; i++) {
            expect(result[i]).toBe(128);
        }
    });

    it('should handle 4:2:2 upsampling (2x horizontal only)', () => {
        const input = new Float32Array([100, 200, 100, 200]);
        const result = upsampleBilinear(input, 2, 2, 4, 2);

        expect(result.length).toBe(8);
        // Should interpolate horizontally
        expect(result[0]).toBe(100);
        expect(result[3]).toBe(200);
    });

    it('should handle 4:4:4 (no upsampling needed)', () => {
        const input = new Float32Array([1, 2, 3, 4]);
        const result = upsampleBilinear(input, 2, 2, 2, 2);

        expect(result.length).toBe(4);
        expect(result[0]).toBe(1);
        expect(result[1]).toBe(2);
        expect(result[2]).toBe(3);
        expect(result[3]).toBe(4);
    });

    it('should handle edge pixels correctly in bilinear', () => {
        const input = new Float32Array([0, 255]);
        const result = upsampleBilinear(input, 2, 1, 4, 1);

        expect(result.length).toBe(4);
        // Edges should match input
        expect(result[0]).toBe(0);
        expect(result[3]).toBe(255);
        // Middle values should be interpolated
        expect(result[1] > 0 && result[1] < 255).toBe(true);
        expect(result[2] > 0 && result[2] < 255).toBe(true);
    });

    it('should upsample with upsampleChroma for 4:2:0', () => {
        const components = {
            Y: new Float32Array(16).fill(128),
            Cb: new Float32Array(4).fill(100),
            Cr: new Float32Array(4).fill(150)
        };

        const samplingFactors = {
            Y: { h: 2, v: 2 },
            Cb: { h: 1, v: 1 },
            Cr: { h: 1, v: 1 }
        };

        const result = upsampleChroma(components, samplingFactors, 4, 4);

        expect(result.Y.length).toBe(16);
        expect(result.Cb.length).toBe(16);
        expect(result.Cr.length).toBe(16);
    });

    it('should not upsample Y component', () => {
        const components = {
            Y: new Float32Array(16).fill(128),
            Cb: new Float32Array(4).fill(100),
            Cr: new Float32Array(4).fill(150)
        };

        const samplingFactors = {
            Y: { h: 2, v: 2 },
            Cb: { h: 1, v: 1 },
            Cr: { h: 1, v: 1 }
        };

        const result = upsampleChroma(components, samplingFactors, 4, 4);

        // Y should be unchanged (same reference)
        expect(result.Y).toBe(components.Y);
    });

    it('should handle 4:2:2 with upsampleChroma', () => {
        const components = {
            Y: new Float32Array(8).fill(128),
            Cb: new Float32Array(4).fill(100),
            Cr: new Float32Array(4).fill(150)
        };

        const samplingFactors = {
            Y: { h: 2, v: 1 },
            Cb: { h: 1, v: 1 },
            Cr: { h: 1, v: 1 }
        };

        const result = upsampleChroma(components, samplingFactors, 4, 2);

        expect(result.Cb.length).toBe(8);
        expect(result.Cr.length).toBe(8);
    });

    it('should preserve values in nearest neighbor upsampling', () => {
        const input = new Float32Array([10, 20, 30, 40]);
        const result = upsampleNearest(input, 2, 2, 4, 4);

        // All values should come from input (no interpolation)
        const uniqueValues = new Set(result);
        expect(uniqueValues.size <= 4).toBe(true);
        expect(uniqueValues.has(10)).toBe(true);
        expect(uniqueValues.has(20)).toBe(true);
        expect(uniqueValues.has(30)).toBe(true);
        expect(uniqueValues.has(40)).toBe(true);
    });

    it('should create smooth gradients with bilinear interpolation', () => {
        const input = new Float32Array([0, 255]);
        const result = upsampleBilinear(input, 2, 1, 4, 1);

        // Values should increase monotonically
        for (let i = 0; i < result.length - 1; i++) {
            expect(result[i] <= result[i + 1]).toBe(true);
        }
    });
});
