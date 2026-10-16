import { describe, it, expect } from '../../utils/test-runner.js';
import { calculateJUniwardCosts } from '../../../src/information-theory/steganography/juniward.js';

describe('Factored J-UNIWARD Spatial Wavelet Distortion Engine', () => {
    it('calculates valid, finite positive costs for all AC coefficients', () => {
        const blocks = [
            new Int32Array(64).fill(0),
            new Int32Array(64).map((_, i) => (i % 5) - 2)
        ];

        const { rhoPlus, rhoMinus, flatACIndices } = calculateJUniwardCosts(blocks);

        expect(rhoPlus.length).toBe(blocks.length * 63);
        expect(rhoMinus.length).toBe(blocks.length * 63);
        expect(flatACIndices.length).toBe(blocks.length * 63);

        for (let i = 0; i < rhoPlus.length; i++) {
            expect(Number.isFinite(rhoPlus[i])).toBe(true);
            expect(rhoPlus[i] > 0).toBe(true);
            expect(rhoMinus[i] > 0).toBe(true);
        }
    });

    it('assigns lower costs to textured/complex blocks than smooth/flat blocks', () => {
        // Flat block: all zeros (smooth sky / flat surface)
        const flatBlock = new Int32Array(64).fill(0);

        // Textured block: rich high-frequency energy
        const texturedBlock = new Int32Array(64);
        for (let i = 0; i < 64; i++) texturedBlock[i] = (i * 17) % 50 - 25;

        const { rhoPlus: flatCosts } = calculateJUniwardCosts([flatBlock]);
        const { rhoPlus: texCosts } = calculateJUniwardCosts([texturedBlock]);

        let avgFlatCost = 0;
        let avgTexCost = 0;
        for (let i = 0; i < 63; i++) {
            avgFlatCost += flatCosts[i];
            avgTexCost += texCosts[i];
        }

        // Textured block has higher wavelet energy -> lower sensitivity xi -> lower cost!
        expect(avgTexCost < avgFlatCost).toBe(true);
    });

    it('applies anti-SCA key-randomized perturbation when costSeed is supplied', () => {
        const block = new Int32Array(64).map((_, i) => i % 10);
        const { rhoPlus: c1 } = calculateJUniwardCosts([block], undefined, { costSeed: 'seed-A' });
        const { rhoPlus: c2 } = calculateJUniwardCosts([block], undefined, { costSeed: 'seed-B' });

        expect(Array.from(c1)).not.toEqual(Array.from(c2));
    });

    it('imposes strong 10x cost penalty on zero-valued AC coefficients', () => {
        const block = new Int32Array(64).fill(0);
        block[1] = 5; // non-zero AC (index 1 in block, flat index 0)
        block[2] = 0; // zero AC (index 2 in block, flat index 1)
        // Use identical quantization step for both coefficients
        const qTable = new Float32Array(64).fill(16);
        const { rhoPlus } = calculateJUniwardCosts([block], qTable);

        // Coefficient 2 (val === 0) should be 10x more expensive than coefficient 1 (val !== 0)
        const ratio = rhoPlus[1] / rhoPlus[0];
        expect(Math.abs(ratio - 10.0) < 0.01).toBe(true);
    });
});
