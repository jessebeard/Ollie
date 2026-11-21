import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { rgbToYcbcr, ycbcrToRgb } from '../../src/algebraic/colorspace/rgb-to-ycbcr.js';
import { forwardDCT } from '../../src/algebraic/discrete-cosine/forward-dct.js';
import { idct } from '../../src/algebraic/discrete-cosine/inverse-dct.js';
import { zigZag } from '../../src/algebraic/mappings/forward-zigzag.js';
import { inverseZigZag } from '../../src/algebraic/mappings/inverse-zigzag.js';
import { quantize } from '../../src/algebraic/quantization/forward-quantization.js';
import { dequantize } from '../../src/algebraic/quantization/inverse-quantization.js';

describe('Algebraic Dedicated PBT Suite', () => {
    it('Property: RGB -> YCbCr -> RGB roundtrip error is strictly bounded (|error| <= 2)', async () => {
        await assertProperty(
            [Arbitrary.integer(0, 255), Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
            (r, g, b) => {
                const [ycbcr] = rgbToYcbcr(r, g, b);
                const [recovered] = ycbcrToRgb(ycbcr.y, ycbcr.cb, ycbcr.cr);

                expect(Math.abs(recovered.r - r)).toBeLessThanOrEqual(2);
                expect(Math.abs(recovered.g - g)).toBeLessThanOrEqual(2);
                expect(Math.abs(recovered.b - b)).toBeLessThanOrEqual(2);
            },
            60
        );
    });

    it('Property: Zigzag <-> Inverse Zigzag forms an exact bijective permutation on 64-element blocks', async () => {
        await assertProperty(
            [Arbitrary.integer(-1000, 1000), Arbitrary.integer(1, 10)],
            (base, step) => {
                const block = new Float32Array(64);
                for (let i = 0; i < 64; i++) block[i] = base + i * step;

                // Forward -> Inverse roundtrip
                const [zigzagged] = zigZag(block);
                const [unzigzagged] = inverseZigZag(zigzagged);
                for (let i = 0; i < 64; i++) {
                    expect(unzigzagged[i]).toBe(block[i]);
                }

                // Inverse -> Forward roundtrip
                const [invOut] = inverseZigZag(block);
                const [roundtrip] = zigZag(invOut);
                for (let i = 0; i < 64; i++) {
                    expect(roundtrip[i]).toBe(block[i]);
                }
            },
            60
        );
    });

    it('Property: DCT -> IDCT preserves pixel values within discrete truncation bounds', async () => {
        await assertProperty(
            [Arbitrary.uint8Array(64)],
            (pixelBlock) => {
                // Shift to zero-centered range [-128, 127]
                const centered = new Float32Array(64);
                for (let i = 0; i < 64; i++) centered[i] = pixelBlock[i] - 128;

                const [freq] = forwardDCT(centered);
                const [spatial] = idct(freq);

                for (let i = 0; i < 64; i++) {
                    const recoveredPixel = Math.round(spatial[i] + 128);
                    expect(Math.abs(recoveredPixel - pixelBlock[i])).toBeLessThanOrEqual(1);
                }
            },
            50
        );
    });

    it('Property: Quantize -> Dequantize error is strictly bounded by half the quantization step (q/2)', async () => {
        await assertProperty(
            [Arbitrary.dctBlock(), Arbitrary.integer(1, 32)],
            (block, qStep) => {
                const qTable = new Int32Array(64).fill(qStep);
                const floatBlock = new Float32Array(64);
                for (let i = 0; i < 64; i++) floatBlock[i] = block[i];

                const [quantized] = quantize(floatBlock, qTable);
                const [dequantized] = dequantize(quantized, qTable);

                for (let i = 0; i < 64; i++) {
                    const diff = Math.abs(dequantized[i] - block[i]);
                    expect(diff).toBeLessThanOrEqual(Math.floor(qStep / 2));
                }
            },
            50
        );
    });
});
