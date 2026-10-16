import { describe, it, expect } from '../../utils/test-runner.js';
import {
    generateSubmatrix,
    stcEmbed,
    stcExtract,
    bytesToBits,
    bitsToBytes,
    WET_COST
} from '../../../src/information-theory/steganography/stc-matrix.js';

describe('Pure JS Syndrome-Trellis Codes (STC)', () => {
    it('generateSubmatrix creates valid binary column integers satisfying STC criteria', () => {
        const h = 8;
        const w = 4;
        const cols = generateSubmatrix(h, w, 'submatrix-seed-123');

        expect(cols.length).toBe(w);
        expect((cols[0] & 1)).toBe(1);
        expect((cols[w - 1] & 1)).toBe(1);
        expect(cols.every(c => c > 0)).toBe(true);
    });

    it('stcEmbed and stcExtract achieve 100% bit-exact roundtrip extraction', () => {
        const N = 1000;
        const M = 100; // w = 10
        const cover = new Int32Array(N);
        for (let i = 0; i < N; i++) cover[i] = (i % 7) - 3;

        const message = new Uint8Array(M);
        for (let i = 0; i < M; i++) message[i] = (i * 13) % 2;

        const rhoPlus = new Float64Array(N).fill(1.0);
        const rhoMinus = new Float64Array(N).fill(1.0);

        const [stego, embedErr] = stcEmbed(cover, message, rhoPlus, rhoMinus, { h: 8, seed: 'test-seed' });
        expect(embedErr).toBe(null);
        expect(stego.length).toBe(N);

        const extracted = stcExtract(stego, M, { h: 8, seed: 'test-seed' });
        expect(extracted.length).toBe(M);
        expect(Array.from(extracted)).toEqual(Array.from(message));
    });

    it('minimizes total distortion according to given cost metrics', () => {
        const N = 120;
        const M = 15; // w = 8
        const cover = new Int32Array(N).fill(0);
        const message = new Uint8Array(M).fill(1); // all 1s

        const rhoPlus = new Float64Array(N);
        const rhoMinus = new Float64Array(N);

        // Make even-indexed slots cheap (cost 1) and odd-indexed slots expensive (cost 100)
        for (let i = 0; i < N; i++) {
            const cost = (i % 2 === 0) ? 1.0 : 100.0;
            rhoPlus[i] = cost;
            rhoMinus[i] = cost;
        }

        const [stego, err] = stcEmbed(cover, message, rhoPlus, rhoMinus, { h: 8, seed: 'distortion-seed' });
        expect(err).toBe(null);

        // Verify that cheap slots were chosen over expensive slots
        let cheapChanges = 0;
        let expensiveChanges = 0;
        for (let i = 0; i < N; i++) {
            if (stego[i] !== cover[i]) {
                if (i % 2 === 0) cheapChanges++;
                else expensiveChanges++;
            }
        }

        expect(cheapChanges > 0).toBe(true);
        expect(expensiveChanges).toBe(0);

        // Verify extraction
        const extracted = stcExtract(stego, M, { h: 8, seed: 'distortion-seed' });
        expect(Array.from(extracted)).toEqual(Array.from(message));
    });

    it('strictly avoids modifying wet elements (rho = WET_COST)', () => {
        const N = 200;
        const M = 20; // w = 10
        const cover = new Int32Array(N).fill(2);
        const message = new Uint8Array(M).fill(1);

        const rhoPlus = new Float64Array(N).fill(1.0);
        const rhoMinus = new Float64Array(N).fill(1.0);

        // Mark slot 0 in every 10-slot block as wet (e.g. simulating DC coefficients)
        for (let i = 0; i < N; i += 10) {
            rhoPlus[i] = WET_COST;
            rhoMinus[i] = WET_COST;
        }

        const [stego, err] = stcEmbed(cover, message, rhoPlus, rhoMinus, { h: 8, seed: 'wet-seed' });
        expect(err).toBe(null);

        // Wet slots must remain strictly untouched
        for (let i = 0; i < N; i += 10) {
            expect(stego[i]).toBe(cover[i]);
        }

        const extracted = stcExtract(stego, M, { h: 8, seed: 'wet-seed' });
        expect(Array.from(extracted)).toEqual(Array.from(message));
    });

    it('bytesToBits and bitsToBytes convert reversibly and deterministically', () => {
        const originalBytes = new Uint8Array([0x00, 0xFF, 0x55, 0xAA, 0x12, 0x34]);
        const bits = bytesToBits(originalBytes);
        expect(bits.length).toBe(originalBytes.length * 8);

        const recoveredBytes = bitsToBytes(bits);
        expect(Array.from(recoveredBytes)).toEqual(Array.from(originalBytes));
    });
});
