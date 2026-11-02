import { describe, it, expect } from '../../utils/test-runner.js';
import { calculateJUniwardCosts, WET_COST } from '../../../src/information-theory/steganography/juniward.js';

describe('Format v4.1 Histogram Detailed Balance (+/-1 <-> +/-2)', () => {
    it('applies detailed balance asymmetric weights across coefficient magnitudes', () => {
        const block = new Int32Array(64);
        block[1] = 1;   // |val| = 1
        block[2] = -1;  // |val| = 1
        block[3] = 2;   // |val| = 2
        block[4] = -2;  // |val| = 2
        block[5] = 3;   // |val| = 3
        block[6] = 1023; // boundary max
        block[7] = -1023; // boundary min

        const qTable = new Float32Array(64).fill(16);
        const { rhoPlus, rhoMinus } = calculateJUniwardCosts([block], qTable);

        // For coeff 1 (val = +1):
        // rhoMinus (toward 0) MUST be WET_COST (shrinkage blocked)
        // rhoPlus (away from 0 to +2) is penalized with 2.5x baseCost
        expect(rhoMinus[0]).toBe(WET_COST);
        expect(rhoPlus[0] > 0.01).toBe(true);

        // For coeff 2 (val = -1):
        // rhoPlus (toward 0) MUST be WET_COST (shrinkage blocked)
        // rhoMinus (away from 0 to -2) is penalized with 2.5x baseCost
        expect(rhoPlus[1]).toBe(WET_COST);
        expect(rhoMinus[1] > 0.01).toBe(true);

        // For coeff 3 (val = +2):
        // rhoMinus (toward 0 to +1) is favored with 0.65x baseCost (replenishes +/-1)
        // rhoPlus (away from 0 to +3) is 1.25x baseCost
        expect(rhoMinus[2] < rhoPlus[2]).toBe(true);

        // For coeff 4 (val = -2):
        // rhoPlus (toward 0 to -1) is favored with 0.65x baseCost
        // rhoMinus (away from 0 to -3) is 1.25x baseCost
        expect(rhoPlus[3] < rhoMinus[3]).toBe(true);

        // For coeff 5 (val = +3):
        // rhoMinus (toward 0) is 0.85x, rhoPlus (away from 0) is 1.15x
        expect(rhoMinus[4] < rhoPlus[4]).toBe(true);

        // For boundary guards:
        // val = +1023: rhoPlus (away from 0 to +1024) MUST be WET_COST
        expect(rhoPlus[5]).toBe(WET_COST);
        // val = -1023: rhoMinus (away from 0 to -1024) MUST be WET_COST
        expect(rhoMinus[6]).toBe(WET_COST);
    });
});
