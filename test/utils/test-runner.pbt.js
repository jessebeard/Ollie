import { describe, it, expect, assert } from './test-runner.js';
import { assertProperty, Arbitrary } from './pbt.js';

describe('Test Runner: Property-Based Testing (PBT Invariants)', () => {

    it('Property: Reflexivity of toEqual (x equals itself for all arbitrary values)', async () => {
        await assertProperty(
            [Arbitrary.jsonValue()],
            (val) => {
                expect(val).toEqual(val);
            },
            100
        );
    });

    it('Property: Symmetry of toEqual (a toEqual b <=> b toEqual a)', async () => {
        await assertProperty(
            [Arbitrary.jsonValue(), Arbitrary.jsonValue()],
            (a, b) => {
                let aEqualsB = false;
                let bEqualsA = false;

                try {
                    expect(a).toEqual(b);
                    aEqualsB = true;
                } catch {}

                try {
                    expect(b).toEqual(a);
                    bEqualsA = true;
                } catch {}

                expect(aEqualsB).toBe(bEqualsA);
            },
            100
        );
    });

    it('Property: Inversion Duality of .not (expect(x).toBe(y) <=> expect(x).not.toBe(y) throws)', async () => {
        await assertProperty(
            [Arbitrary.integer(-1000, 1000), Arbitrary.integer(-1000, 1000)],
            (a, b) => {
                if (a === b) {
                    expect(a).toBe(b);
                    expect(() => expect(a).not.toBe(b)).toThrow();
                } else {
                    expect(a).not.toBe(b);
                    expect(() => expect(a).toBe(b)).toThrow();
                }
            },
            100
        );
    });

    it('Property: Numerical Ordering Transitivity (a < b and b < c => a < c)', async () => {
        await assertProperty(
            [Arbitrary.integer(-10000, 10000), Arbitrary.integer(1, 100), Arbitrary.integer(1, 100)],
            (base, d1, d2) => {
                const a = base;
                const b = base + d1;
                const c = b + d2;

                expect(a).toBeLessThan(b);
                expect(b).toBeLessThan(c);
                expect(a).toBeLessThan(c);
                expect(c).toBeGreaterThan(a);
            },
            100
        );
    });

    it('Property: Uint8Array Buffer Clone Identity in toEqual', async () => {
        await assertProperty(
            [Arbitrary.bytes(0, 128)],
            (u) => {
                const clone = new Uint8Array(u.length);
                clone.set(u);
                expect(u).toEqual(clone);
                expect(clone).toEqual(u);
                expect(u).toHaveLength(clone.length);
            },
            100
        );
    });
});

describe('Test Runner: Metamorphic Testing (MR Relations)', () => {

    it('MR-1: Substring Monotonicity in toContain & toMatch under arbitrary padding', async () => {
        await assertProperty(
            [Arbitrary.string(1, 20), Arbitrary.string(0, 20), Arbitrary.string(0, 20)],
            (core, prefix, suffix) => {
                const wrapped = prefix + core + suffix;
                expect(wrapped).toContain(core);
                expect(wrapped).toMatch(core);
            },
            100
        );
    });

    it('MR-2: Precision Coarsening Invariance in toBeCloseTo (p1 <= p2)', async () => {
        await assertProperty(
            [Arbitrary.float(-100, 100)],
            (val) => {
                const delta = 0.00001;
                const candidate = val + delta;
                // If close at precision 4, must also be close at precision 2 and 1
                expect(candidate).toBeCloseTo(val, 4);
                expect(candidate).toBeCloseTo(val, 3);
                expect(candidate).toBeCloseTo(val, 2);
                expect(candidate).toBeCloseTo(val, 1);
            },
            100
        );
    });

    it('MR-3: Length Invariance under Array Reversal & Slicing', async () => {
        await assertProperty(
            [Arbitrary.array(Arbitrary.integer(0, 100), 0, 50)],
            (arr) => {
                const len = arr.length;
                const reversed = [...arr].reverse();
                expect(arr).toHaveLength(len);
                expect(reversed).toHaveLength(len);

                if (len >= 2) {
                    const sliced = arr.slice(1);
                    expect(sliced).toHaveLength(len - 1);
                }
            },
            100
        );
    });

    it('MR-4: Permutation Invariance on Set Equality in toEqual', async () => {
        await assertProperty(
            [Arbitrary.array(Arbitrary.string(1, 5), 1, 10)],
            (items) => {
                const unique = Array.from(new Set(items));
                const sorted1 = [...unique].sort();
                const sorted2 = [...unique].sort().reverse().sort();
                expect(sorted1).toEqual(sorted2);
            },
            100
        );
    });
});
