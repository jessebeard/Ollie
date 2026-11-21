import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { GenericGF } from '../../src/information-theory/error-correction/galois-field.js';
import { ReedSolomonEncoder, ReedSolomonDecoder } from '../../src/information-theory/error-correction/reed-solomon-codec.js';

describe('ECC Dedicated PBT Suite', () => {
    const gf = new GenericGF(0x11D, 256, 0); // Standard QR/RS GF(256)

    it('Property: GF(256) additive group axioms (identity, self-inverse, commutativity)', async () => {
        await assertProperty(
            [Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
            (a, b) => {
                // Identity: a ^ 0 === a
                expect(GenericGF.addOrSubtract(a, 0)).toBe(a);

                // Self-inverse: a ^ a === 0
                expect(GenericGF.addOrSubtract(a, a)).toBe(0);

                // Commutativity: a ^ b === b ^ a
                expect(GenericGF.addOrSubtract(a, b)).toBe(GenericGF.addOrSubtract(b, a));
            },
            60
        );
    });

    it('Property: GF(256) multiplicative group axioms (identity, inverse, distributivity)', async () => {
        await assertProperty(
            [Arbitrary.integer(1, 255), Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
            (a, b, c) => {
                // Multiplicative identity: a * 1 === a
                expect(gf.multiply(a, 1)).toBe(a);

                // Multiplicative inverse: a * a^-1 === 1
                const invA = gf.inverse(a);
                expect(gf.multiply(a, invA)).toBe(1);

                // Distributive law: a * (b ^ c) === (a * b) ^ (a * c)
                const lhs = gf.multiply(a, GenericGF.addOrSubtract(b, c));
                const rhs = GenericGF.addOrSubtract(gf.multiply(a, b), gf.multiply(a, c));
                expect(lhs).toBe(rhs);
            },
            60
        );
    });

    it('Property: Reed-Solomon corrects up to floor(ecBytes/2) corrupted symbols exactly', async () => {
        const encoder = new ReedSolomonEncoder(gf);
        const decoder = new ReedSolomonDecoder(gf);

        await assertProperty(
            [Arbitrary.byteArray(8, 20), Arbitrary.integer(1, 3)],
            (data, numErrors) => {
                const ecBytes = 6; // Capacity = floor(6/2) = 3 errors
                const totalLen = data.length + ecBytes;
                const codeword = new Int32Array(totalLen);
                for (let i = 0; i < data.length; i++) codeword[i] = data[i];

                encoder.encode(codeword, ecBytes);

                // Pick numErrors distinct random positions across entire codeword (data + parity)
                const corruptIndices = new Set();
                while (corruptIndices.size < numErrors) {
                    corruptIndices.add(Math.floor(Math.random() * totalLen));
                }

                for (const idx of corruptIndices) {
                    codeword[idx] ^= 0x55;
                }

                const [, err] = decoder.decodeTuple(codeword, ecBytes);
                expect(err).toBe(null);

                // Verify data symbols recovered
                for (let i = 0; i < data.length; i++) {
                    expect(codeword[i]).toBe(data[i]);
                }
            },
            40
        );
    });

    it('Property: Reed-Solomon strictly fails closed when error count exceeds floor(ecBytes/2)', async () => {
        const encoder = new ReedSolomonEncoder(gf);
        const decoder = new ReedSolomonDecoder(gf);

        await assertProperty(
            [Arbitrary.byteArray(8, 20)],
            (data) => {
                const ecBytes = 6; // Capacity = 3 errors
                const totalLen = data.length + ecBytes;
                const codeword = new Int32Array(totalLen);
                for (let i = 0; i < data.length; i++) codeword[i] = data[i];

                encoder.encode(codeword, ecBytes);

                // Inject 4 distinct corruptions (strictly exceeds capacity of 3)
                const corruptIndices = new Set();
                while (corruptIndices.size < 4) {
                    corruptIndices.add(Math.floor(Math.random() * totalLen));
                }

                for (const idx of corruptIndices) {
                    codeword[idx] ^= 0x33;
                }

                const [, err] = decoder.decodeTuple(codeword, ecBytes);
                expect(err !== null).toBe(true);
            },
            30
        );
    });
});
