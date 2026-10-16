import { describe, it, expect } from '../utils/test-runner.js';
import { runStegoFuzz } from './stego-fuzz.mjs';

describe('Steganography fuzz slice (smoke)', () => {
    it('holds STC trellis roundtrips, opaque framing and tamper rejection properties', async () => {
        await runStegoFuzz(1);
        expect(true).toBe(true);
    });
});
