import { describe, it, expect } from '../../utils/test-runner.js';
import { calculateCarrierSalt, CARRIER_SALT_PREFIX } from '../../../src/information-theory/steganography/carrier-salt.js';

describe('Format v4.1 Carrier Salt (carrierSalt)', () => {
    const DEFAULT_Q = new Uint16Array(64).fill(16);

    function createBlocks(count = 10, fillVal = 100) {
        const blocks = [];
        for (let i = 0; i < count; i++) {
            const blk = new Int32Array(64);
            blk[0] = fillVal + i; // DC coefficient
            for (let c = 1; c < 64; c++) {
                blk[c] = (i + c) % 15 - 7; // AC coefficients
            }
            blocks.push(blk);
        }
        return blocks;
    }

    it('has an exact 24-byte ASCII prefix', () => {
        expect(CARRIER_SALT_PREFIX).toBe('ollie/v4.1/carrier-salt/');
        const prefixBytes = new TextEncoder().encode(CARRIER_SALT_PREFIX);
        expect(prefixBytes.length).toBe(24);
    });

    it('produces a deterministic 32-byte SHA-256 hash', async () => {
        const blocks = createBlocks(20);
        const [salt1, err1] = await calculateCarrierSalt(blocks, [DEFAULT_Q, DEFAULT_Q, DEFAULT_Q]);
        expect(err1).toBe(null);
        expect(salt1 instanceof Uint8Array).toBe(true);
        expect(salt1.length).toBe(32);

        const [salt2, err2] = await calculateCarrierSalt(blocks, [DEFAULT_Q, DEFAULT_Q, DEFAULT_Q]);
        expect(err2).toBe(null);
        expect(Array.from(salt1)).toEqual(Array.from(salt2));
    });

    it('is 100% invariant to AC coefficient modifications (stego changes)', async () => {
        const coverBlocks = createBlocks(30, 200);
        const [coverSalt, coverErr] = await calculateCarrierSalt(coverBlocks, [DEFAULT_Q]);
        expect(coverErr).toBe(null);

        // Simulate extensive steganographic embedding changes to AC coefficients (c = 1..63)
        const stegoBlocks = coverBlocks.map(b => new Int32Array(b));
        for (let i = 0; i < stegoBlocks.length; i++) {
            for (let c = 1; c < 64; c++) {
                stegoBlocks[i][c] = (stegoBlocks[i][c] + 1) % 50; // Modify AC
            }
        }

        const [stegoSalt, stegoErr] = await calculateCarrierSalt(stegoBlocks, [DEFAULT_Q]);
        expect(stegoErr).toBe(null);
        expect(Array.from(stegoSalt)).toEqual(Array.from(coverSalt));
    });

    it('changes completely when a single DC coefficient changes', async () => {
        const blocks1 = createBlocks(20, 150);
        const blocks2 = blocks1.map(b => new Int32Array(b));
        // Modify a single DC coefficient by 1
        blocks2[5][0] += 1;

        const [salt1] = await calculateCarrierSalt(blocks1, [DEFAULT_Q]);
        const [salt2] = await calculateCarrierSalt(blocks2, [DEFAULT_Q]);
        expect(Array.from(salt1)).not.toEqual(Array.from(salt2));
    });

    it('changes completely when a quantization table changes', async () => {
        const blocks = createBlocks(20, 150);
        const qTableA = new Uint16Array(64).fill(16);
        const qTableB = new Uint16Array(64).fill(16);
        qTableB[0] = 17; // Change DC quantizer

        const [saltA] = await calculateCarrierSalt(blocks, [qTableA]);
        const [saltB] = await calculateCarrierSalt(blocks, [qTableB]);
        expect(Array.from(saltA)).not.toEqual(Array.from(saltB));
    });

    it('supports grayscale (C=1) and YCbCr (C=3) components', async () => {
        const blocks = createBlocks(10);
        const [salt1, err1] = await calculateCarrierSalt(blocks, [DEFAULT_Q]);
        expect(err1).toBe(null);

        const [salt3, err3] = await calculateCarrierSalt(blocks, [DEFAULT_Q, DEFAULT_Q, DEFAULT_Q]);
        expect(err3).toBe(null);
        expect(Array.from(salt1)).not.toEqual(Array.from(salt3));
    });
});
