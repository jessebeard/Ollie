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

    it('locks zero coefficients and ±1 -> 0 shrinkage with WET_COST', () => {
        const block = new Int32Array(64).fill(0);
        block[1] = 0;  // zero AC
        block[2] = 1;  // +1 AC
        block[3] = -1; // -1 AC
        block[4] = 3;  // +3 AC
        block[5] = -3; // -3 AC

        const WET = 1e12;
        const { rhoPlus, rhoMinus } = calculateJUniwardCosts([block]);

        // 1. Zero coefficient (index 1 in block, flat index 0): both wet
        expect(rhoPlus[0]).toBe(WET);
        expect(rhoMinus[0]).toBe(WET);

        // 2. +1 coefficient (index 2 in block, flat index 1): -1 shrinkage to zero is wet, +1 expansion is normal
        expect(rhoMinus[1]).toBe(WET);
        expect(rhoPlus[1] < WET).toBe(true);

        // 3. -1 coefficient (index 3 in block, flat index 2): +1 shrinkage to zero is wet, -1 expansion is normal
        expect(rhoPlus[2]).toBe(WET);
        expect(rhoMinus[2] < WET).toBe(true);

        // 4. |val| >= 2 (index 4 and 5 in block, flat index 3 and 4): favors moving toward zero (0.9x vs 1.1x)
        expect(rhoMinus[3] < rhoPlus[3]).toBe(true); // +3: -1 is toward zero (cheaper)
        expect(rhoPlus[4] < rhoMinus[4]).toBe(true); // -3: +1 is toward zero (cheaper)
    });

    it('heavily penalizes high-frequency AC modes via Q_u,v and basis wavelet response norms', () => {
        const block = new Int32Array(64).fill(2); // all ACs set to 2 so value is identical
        const { rhoPlus } = calculateJUniwardCosts([block]);

        // Compare low frequency mode (zigzag index 1) vs high frequency mode (zigzag index 63)
        const lowFreqCost = rhoPlus[0];  // coeffIdx 1
        const highFreqCost = rhoPlus[62]; // coeffIdx 63

        // High frequency AC mode has larger basis norm and larger Q step, yielding much higher cost
        expect(highFreqCost > lowFreqCost * 50).toBe(true);
    });

    it('enforces chrominance penalty and luminance-only options', () => {
        const yBlock = new Int32Array(64).fill(2);
        const chromaBlock = new Int32Array(64).fill(2);

        // With 4x chroma penalty
        const { rhoPlus: costsChroma } = calculateJUniwardCosts([yBlock, chromaBlock], undefined, {
            yBlockCount: 1,
            chromaPenalty: 4.0
        });
        const yCost = costsChroma[0];
        const cbCost = costsChroma[63];
        expect(cbCost >= yCost * 3.9).toBe(true);

        // With luminanceOnly
        const WET = 1e12;
        const { rhoPlus: costsLumOnly } = calculateJUniwardCosts([yBlock, chromaBlock], undefined, {
            yBlockCount: 1,
            luminanceOnly: true
        });
        expect(costsLumOnly[0] < WET).toBe(true);
        expect(costsLumOnly[63]).toBe(WET);
    });
});
