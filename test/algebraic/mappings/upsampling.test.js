import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { upsampleNearest, upsampleBilinear, upsampleChroma } from '../../../src/algebraic/mappings/upsampling.js';

describe('Chroma Upsampling', () => {
    it('should upsample 2x2 to 4x4 using nearest neighbor', () => {
        const input = new Float32Array([1, 2, 3, 4]);
        const result = upsampleNearest(input, 2, 2, 4, 4);

        expect(result.length).toBe(16);
        
        expect(result[0]).toBe(1);
        expect(result[1]).toBe(1);
        expect(result[4]).toBe(1);
        expect(result[5]).toBe(1);
    });

    it('should upsample 2x2 to 4x4 using bilinear interpolation', () => {
        const input = new Float32Array([0, 100, 0, 100]);
        const result = upsampleBilinear(input, 2, 2, 4, 4);

        expect(result.length).toBe(16);
        
        expect(result[0]).toBe(0);
        expect(result[3]).toBe(100);
        expect(result[12]).toBe(0);
        expect(result[15]).toBe(100);
    });

    it('should handle 4:2:0 upsampling (2x horizontal, 2x vertical)', () => {
        const input = new Float32Array([128, 128, 128, 128]);
        const result = upsampleBilinear(input, 2, 2, 4, 4);

        expect(result.length).toBe(16);
        
        for (let i = 0; i < 16; i++) {
            expect(result[i]).toBe(128);
        }
    });

    it('should handle 4:2:2 upsampling (2x horizontal only)', () => {
        const input = new Float32Array([100, 200, 100, 200]);
        const result = upsampleBilinear(input, 2, 2, 4, 2);

        expect(result.length).toBe(8);
        
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
        
        expect(result[0]).toBe(0);
        expect(result[3]).toBe(255);
        
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

        for (let i = 0; i < result.length - 1; i++) {
            expect(result[i] <= result[i + 1]).toBe(true);
        }
    });

    describe('PBT & Metamorphic Invariants', () => {
        it('Property: upsampling output length is strictly targetWidth * targetHeight', async () => {
            await assertProperty(
                [Arbitrary.integer(2, 16), Arbitrary.integer(2, 16)],
                (srcW, srcH) => {
                    const targetW = srcW * 2;
                    const targetH = srcH * 2;
                    const input = new Float32Array(srcW * srcH).fill(128);

                    const resNearest = upsampleNearest(input, srcW, srcH, targetW, targetH);
                    expect(resNearest.length).toBe(targetW * targetH);

                    const resBilinear = upsampleBilinear(input, srcW, srcH, targetW, targetH);
                    expect(resBilinear.length).toBe(targetW * targetH);
                },
                40
            );
        });

        it('Property: uniform input planes remain strictly uniform under bilinear upsampling', async () => {
            await assertProperty(
                [Arbitrary.integer(2, 16), Arbitrary.integer(2, 16), Arbitrary.integer(0, 255)],
                (srcW, srcH, val) => {
                    const targetW = srcW * 2;
                    const targetH = srcH * 2;
                    const input = new Float32Array(srcW * srcH).fill(val);

                    const output = upsampleBilinear(input, srcW, srcH, targetW, targetH);
                    expect(output.length).toBe(targetW * targetH);
                    for (let i = 0; i < output.length; i++) {
                        expect(output[i]).toBeCloseTo(val, 1);
                    }
                },
                40
            );
        });

        it('Metamorphic MR: upsampled values are bounded by [min(input), max(input)]', async () => {
            await assertProperty(
                [Arbitrary.integer(2, 8), Arbitrary.integer(2, 8)],
                (srcW, srcH) => {
                    const input = new Float32Array(srcW * srcH);
                    let minVal = Infinity;
                    let maxVal = -Infinity;
                    for (let i = 0; i < input.length; i++) {
                        input[i] = (i * 17) % 256;
                        if (input[i] < minVal) minVal = input[i];
                        if (input[i] > maxVal) maxVal = input[i];
                    }

                    const output = upsampleBilinear(input, srcW, srcH, srcW * 2, srcH * 2);
                    for (let i = 0; i < output.length; i++) {
                        expect(output[i]).toBeGreaterThanOrEqual(minVal - 0.001);
                        expect(output[i]).toBeLessThanOrEqual(maxVal + 0.001);
                    }
                },
                30
            );
        });
    });
});
