import { describe, it, expect } from '../../utils/test-runner.js';
import { JpegDecoder } from '../../../src/jpeg-decoder.js';
import { idctNaive, idctAAN } from '../../../src/core/decoder/idct.js';

describe('IDCT Switching', () => {
    it('should allow configuring the IDCT method', () => {
        const decoder = new JpegDecoder();

        // Default should be naive (or whatever we set)
        // We need to check if we can set it.
        // Since JpegDecoder doesn't expose the IDCT method directly, 
        // we might need to inspect it or rely on behavior.
        // But for this test, we want to ensure the API exists.

        // Proposed API: constructor option or setter
        // Let's go with setter for runtime switching

        expect(typeof decoder.setIdctMethod).toBe('function');

        decoder.setIdctMethod(idctNaive);
        expect(decoder.idctMethod).toBe(idctNaive);

        decoder.setIdctMethod(idctAAN);
        expect(decoder.idctMethod).toBe(idctAAN);
    });

    it('should use the configured IDCT method during decoding', () => {
        // This is harder to test without mocking or spying.
        // Since we don't have a mocking library, we can pass a custom function
        // and see if it gets called.

        let called = false;
        const spyIdct = (coeffs) => {
            called = true;
            return new Float32Array(64);
        };

        const decoder = new JpegDecoder();
        decoder.setIdctMethod(spyIdct);

        // We need a minimal valid JPEG to trigger decoding
        // Or we can just test the internal method if we can access it.
        // But `assembleImage` calls `idct`.
        // Let's try to construct a minimal state and call assembleImage directly?
        // assembleImage relies on this.components, frameHeader, etc.
        // It might be easier to just trust the setter works if we implement it right,
        // or use a very small dummy JPEG.

        // Let's try to set up the internal state manually for `assembleImage`
        decoder.frameHeader = {
            width: 8, height: 8,
            components: [{ id: 1, hSampling: 1, vSampling: 1, quantTableId: 0 }]
        };
        decoder.quantizationTables = new Map();
        decoder.quantizationTables.set(0, new Int32Array(64));

        decoder.components = {
            1: {
                blocks: [new Int32Array(64)], // Dummy block
                blocksH: 1,
                blocksV: 1,
                hSampling: 1,
                vSampling: 1
            }
        };

        try {
            decoder.assembleImage();
        } catch (e) {
            // It might fail later in the pipeline (upsampling etc)
            // but we just want to know if spyIdct was called.
        }

        expect(called).toBe(true);
    });
});
