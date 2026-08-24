import { describe, it, expect } from '../utils/test-runner.js';
import { runCliFuzz } from '../fuzz/cli-fuzz.mjs';

describe('CLI fuzz slice (smoke)', () => {
    it('survives arbitrary argument soup and hostile file inputs', async () => {
        await runCliFuzz(1);
        expect(true).toBe(true);
    });
});
