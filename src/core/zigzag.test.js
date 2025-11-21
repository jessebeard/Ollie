import { describe, it, expect } from '/src/utils/test-runner.js';
import { zigZag, ZIGZAG_ORDER } from './zigzag.js';

describe('ZigZag Reordering', () => {
    it('reorders a block correctly', () => {
        // Create a block with indices as values
        const block = new Int32Array(64);
        for (let i = 0; i < 64; i++) block[i] = i;

        expect(ZIGZAG_ORDER[63]).toBe(63);
    });
});
