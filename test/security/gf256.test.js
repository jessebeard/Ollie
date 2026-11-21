import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { EXP_TABLE, LOG_TABLE, gfMultiply, gfInverse } from '../../src/information-theory/secret-sharing/gf256.js';

describe('GF(256) field axioms (poly 0x11D, generator 2)', () => {

    it('builds exp/log tables that are mutual inverses', () => {
        expect(EXP_TABLE).toHaveLength(512);
        expect(LOG_TABLE).toHaveLength(256);

        for (let x = 1; x <= 255; x++) {
            expect(EXP_TABLE[LOG_TABLE[x]]).toBe(x);
        }
        for (let i = 0; i < 255; i++) {
            expect(LOG_TABLE[EXP_TABLE[i]]).toBe(i);
            // exp wraps with period 255
            expect(EXP_TABLE[i + 255]).toBe(EXP_TABLE[i]);
        }
    });

    it('multiplication is commutative and has 1 as identity', async () => {
        await assertProperty(
            [Arbitrary.byte(), Arbitrary.byte()],
            (a, b) => {
                expect(gfMultiply(a, b)).toBe(gfMultiply(b, a));
                expect(gfMultiply(a, 1)).toBe(a);
                if (a !== 0 && b !== 0) {
                    expect(gfMultiply(a, b)).not.toBe(0);
                }
            },
            60
        );
    });

    it('every nonzero element has a multiplicative inverse', async () => {
        for (let a = 1; a <= 255; a++) {
            const inv = gfInverse(a);
            expect(gfMultiply(a, inv)).toBe(1);
        }
        expect(gfInverse(0)).toBe(0);
    });

    it('distributes over XOR (ring property sampled)', async () => {
        await assertProperty(
            [Arbitrary.byte(), Arbitrary.byte(), Arbitrary.byte()],
            (a, b, c) => {
                const left = gfMultiply(a, b ^ c);
                const right = gfMultiply(a, b) ^ gfMultiply(a, c);
                expect(left).toBe(right);
            },
            60
        );
    });
});
