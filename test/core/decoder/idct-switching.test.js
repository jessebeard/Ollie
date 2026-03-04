import { describe, it, expect } from '../../utils/test-runner.js';
import { JpegDecoder } from '../../../src/core/jpeg-decoder.js';
import { idctNaive, idctAAN } from '../../../src/core/decoder/idct.js';

describe('IDCT Switching', () => {
    it('should allow configuring the IDCT method', () => {
        const decoder = new JpegDecoder();

        expect(typeof decoder.setIdctMethod).toBe('function');

        decoder.setIdctMethod(idctNaive);
        expect(decoder.idctMethod).toBe(idctNaive);

        decoder.setIdctMethod(idctAAN);
        expect(decoder.idctMethod).toBe(idctAAN);
    });

    it('should use the configured IDCT method during decoding', () => {

        let called = false;
        const spyIdct = (coeffs) => {
            called = true;
            return [new Float32Array(64), null];
        };

        const decoder = new JpegDecoder();
        decoder.setIdctMethod(spyIdct);

        decoder.frameHeader = {
            width: 8, height: 8,
            components: [{ id: 1, hSampling: 1, vSampling: 1, quantTableId: 0 }]
        };
        decoder.quantizationTables = new Map();
        decoder.quantizationTables.set(0, new Int32Array(64));

        decoder.components = {
            1: {
                blocks: [new Int32Array(64)],
                blocksH: 1,
                blocksV: 1,
                hSampling: 1,
                vSampling: 1
            }
        };

        try {
            decoder.assembleImage();
        } catch (e) {

        }

        expect(called).toBe(true);
    });
});
