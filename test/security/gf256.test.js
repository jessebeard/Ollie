import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { EXP_TABLE, LOG_TABLE, gfMultiply, gfInverse } from '../../src/information-theory/secret-sharing/gf256.js';

describe('GF(256) field axioms (poly 0x11D, generator 2)', () => {

    it('builds exp/log tables that are mutual inverses', () => {
        if (EXP_TABLE.length !== 512) throw new Error(`exp table must be 512 entries, got ${EXP_TABLE.length}`);
        if (LOG_TABLE.length !== 256) throw new Error(`log table must be 256 entries, got ${LOG_TABLE.length}`);

        for (let x = 1; x <= 255; x++) {
            if (EXP_TABLE[LOG_TABLE[x]] !== x) throw new Error(`exp(log(${x})) != ${x}`);
        }
        for (let i = 0; i < 255; i++) {
            if (LOG_TABLE[EXP_TABLE[i]] !== i) throw new Error(`log(exp(${i})) != ${i}`);
            // exp wraps with period 255
            if (EXP_TABLE[i + 255] !== EXP_TABLE[i]) throw new Error(`exp period broken at ${i}`);
        }
    });

    it('multiplication is commutative and has 1 as identity', async () => {
        await assertProperty(
            [Arbitrary.byte(), Arbitrary.byte()],
            (a, b) => {
                if (gfMultiply(a, b) !== gfMultiply(b, a)) throw new Error('not commutative');
                if (gfMultiply(a, 1) !== a) throw new Error('identity broken');
                if (a !== 0 && b !== 0 && gfMultiply(a, b) === 0) throw new Error('zero divisor in field');
            },
            60
        );
    });

    it('every nonzero element has a multiplicative inverse', async () => {
        for (let a = 1; a <= 255; a++) {
            const inv = gfInverse(a);
            if (gfMultiply(a, inv) !== 1) throw new Error(`inverse of ${a} is wrong`);
        }
        if (gfInverse(0) !== 0) throw new Error('inverse(0) must follow the RS convention of mapping to 0');
    });

    it('distributes over XOR (ring property sampled)', async () => {
        await assertProperty(
            [Arbitrary.byte(), Arbitrary.byte(), Arbitrary.byte()],
            (a, b, c) => {
                const left = gfMultiply(a, b ^ c);
                const right = gfMultiply(a, b) ^ gfMultiply(a, c);
                if (left !== right) throw new Error('distribution over XOR broken');
            },
            60
        );
    });
});
