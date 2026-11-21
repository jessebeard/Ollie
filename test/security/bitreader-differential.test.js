import { describe, it, expect } from '../utils/test-runner.js';
import { runBitstreamsFuzz } from '../fuzz/bitstreams-fuzz.mjs';

describe('BitReader differential properties', () => {
    it('holds bit-vs-block, core-tracking, stuffed-stream and marker contracts', async () => {
        await runBitstreamsFuzz(1);
        expect(true).toBe(true);
    });
});
