import { describe, it, expect } from '../../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';
import { JpegEncoder } from '../../../src/codec/encoder.js';
import { JpegDecoder } from '../../../src/codec/decoder.js';

describe('JPEG Decoder - RST Marker Robustness (PBT)', () => {

    it('Should correctly decode streams with arbitrary Restart Intervals', async () => {
        // Enforce that inserting Restart Intervals (DRI + RSTm markers) into the entropy
        // stream does not disrupt decoding, and the image data remains identical to
        // a structurally sound baseline stream.

        await assertProperty(
            // Generators: [width, height, restartInterval]
            // We use small dimensions for PBT speed, but large enough to generate multiple MCUs
            [Arbitrary.integer(32, 128), Arbitrary.integer(32, 128), Arbitrary.integer(1, 10)],
            async (width, height, restartInterval) => {
                // Mod 8 for clean block geometry
                width = Math.max(8, width - (width % 8));
                height = Math.max(8, height - (height % 8));

                const data = new Uint8ClampedArray(width * height * 4);
                // Fill with basic procedural noise
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = Math.floor(Math.random() * 256);
                    data[i + 1] = Math.floor(Math.random() * 256);
                    data[i + 2] = Math.floor(Math.random() * 256);
                    data[i + 3] = 255;
                }

                // 1. Encode with standard baseline (no restart intervals)
                const encoderBase = new JpegEncoder(75, { restartInterval: 0 });
                const baseJpeg = await encoderBase.encode({ width, height, data });

                // 2. Encode with aggressive restart intervals
                const encoderRst = new JpegEncoder(75, { restartInterval: restartInterval });
                const rstJpeg = await encoderRst.encode({ width, height, data });

                // Ensure the RST JPEG is logically slightly larger due to marker overhead
                // Since this might not be strictly true for tiny random files if Huffman codes shift,
                // we skip size assertions and focus strictly on decoding structural parity.

                const decoder = new JpegDecoder();

                // Decode Baseline
                const [baseDecoded, baseErr] = await decoder.decode(baseJpeg);
                expect(baseErr).toEqual(null);

                // Decode RST-laced JPEG
                const [rstDecoded, rstErr] = await decoder.decode(rstJpeg);
                expect(rstErr).toEqual(null);

                // Assert dimensions
                expect(baseDecoded.width).toBe(rstDecoded.width);
                expect(baseDecoded.height).toBe(rstDecoded.height);

                // Assert pixel matching. Both encodings used same quality parameters, 
                // so DCT quantization loss is identical. The only difference is the 
                // predictive DC resets, but mathematically it's isomorphic.
                let mismatches = 0;
                for (let i = 0; i < baseDecoded.data.length; i += 4) { // Only check RGB
                    if (baseDecoded.data[i] !== rstDecoded.data[i] ||
                        baseDecoded.data[i + 1] !== rstDecoded.data[i + 1] ||
                        baseDecoded.data[i + 2] !== rstDecoded.data[i + 2]) {
                        mismatches++;
                    }
                }

                // We expect exactly zero mismatches (0 degradation)
                expect(mismatches).toBe(0);
            },
            10 // Runs (kept moderate to prevent PBT timeout, 10 iterations of encode/decode)
        );
    });

});
