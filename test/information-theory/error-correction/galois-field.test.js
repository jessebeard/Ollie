import { describe, it, expect } from '../../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../../utils/pbt.js';
import {
    GenericGF,
    GenericGFPoly,
    GenericGF_QR_CODE_FIELD_256,
    GenericGF_DATA_MATRIX_FIELD_256
} from '../../../src/information-theory/error-correction/galois-field.js';

const gf256 = GenericGF_QR_CODE_FIELD_256;

describe('GenericGF (Galois Field)', () => {

    describe('Field Construction', () => {
        it('exp and log tables should be size 256', () => {
            expect(gf256.expTable.length).toBe(256);
            expect(gf256.logTable.length).toBe(256);
        });

        it('exp table should have all values 1..255 exactly once', () => {
            const seen = new Set();
            for (let i = 0; i < 255; i++) {
                const v = gf256.expTable[i];
                expect(v >= 1 && v <= 255).toBe(true);
                seen.add(v);
            }
            expect(seen.size).toBe(255);
        });

        it('log(exp(i)) === i for all i in [0, 254]', () => {
            for (let i = 0; i < 255; i++) {
                expect(gf256.logTable[gf256.expTable[i]]).toBe(i);
            }
        });

        it('getSize returns 256', () => {
            expect(gf256.getSize()).toBe(256);
        });

        it('getGeneratorBase returns expected value', () => {
            expect(gf256.getGeneratorBase()).toBe(0);
        });

        it('toString includes primitive', () => {
            const str = gf256.toString();
            expect(str.includes('GF(')).toBe(true);
        });
    });

    describe('addOrSubtract (XOR)', () => {
        it('a XOR a === 0 (self-inverse)', () => {
            assertProperty(
                [Arbitrary.integer(0, 255)],
                (a) => {
                    expect(GenericGF.addOrSubtract(a, a)).toBe(0);
                },
                100
            );
        });

        it('a XOR 0 === a (identity)', () => {
            assertProperty(
                [Arbitrary.integer(0, 255)],
                (a) => {
                    expect(GenericGF.addOrSubtract(a, 0)).toBe(a);
                },
                100
            );
        });

        it('commutativity: a XOR b === b XOR a', () => {
            assertProperty(
                [Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
                (a, b) => {
                    expect(GenericGF.addOrSubtract(a, b)).toBe(GenericGF.addOrSubtract(b, a));
                },
                100
            );
        });

        it('associativity: (a XOR b) XOR c === a XOR (b XOR c)', () => {
            assertProperty(
                [Arbitrary.integer(0, 255), Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
                (a, b, c) => {
                    const lhs = GenericGF.addOrSubtract(GenericGF.addOrSubtract(a, b), c);
                    const rhs = GenericGF.addOrSubtract(a, GenericGF.addOrSubtract(b, c));
                    expect(lhs).toBe(rhs);
                },
                100
            );
        });
    });

    describe('multiply', () => {
        it('a * 1 === a (multiplicative identity)', () => {
            assertProperty(
                [Arbitrary.integer(1, 255)],
                (a) => {
                    expect(gf256.multiply(a, 1)).toBe(a);
                },
                100
            );
        });

        it('a * 0 === 0 (zero annihilation)', () => {
            assertProperty(
                [Arbitrary.integer(0, 255)],
                (a) => {
                    expect(gf256.multiply(a, 0)).toBe(0);
                },
                100
            );
        });

        it('commutativity: a * b === b * a', () => {
            assertProperty(
                [Arbitrary.integer(1, 255), Arbitrary.integer(1, 255)],
                (a, b) => {
                    expect(gf256.multiply(a, b)).toBe(gf256.multiply(b, a));
                },
                100
            );
        });

        it('result is always in [0, 255]', () => {
            assertProperty(
                [Arbitrary.integer(0, 255), Arbitrary.integer(0, 255)],
                (a, b) => {
                    const result = gf256.multiply(a, b);
                    expect(result >= 0 && result <= 255).toBe(true);
                },
                100
            );
        });
    });

    describe('inverse', () => {
        it('a * inverse(a) === 1 for all non-zero a', () => {
            assertProperty(
                [Arbitrary.integer(1, 255)],
                (a) => {
                    const inv = gf256.inverse(a);
                    expect(gf256.multiply(a, inv)).toBe(1);
                },
                100
            );
        });

        it('inverse(inverse(a)) === a (involution)', () => {
            assertProperty(
                [Arbitrary.integer(1, 255)],
                (a) => {
                    expect(gf256.inverse(gf256.inverse(a))).toBe(a);
                },
                100
            );
        });

        it('inverse(0) throws', () => {
            let threw = false;
            try {
                gf256.inverse(0);
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
        });
    });

    describe('log / exp', () => {
        it('exp(log(a)) === a for all non-zero a', () => {
            assertProperty(
                [Arbitrary.integer(1, 255)],
                (a) => {
                    expect(gf256.exp(gf256.log(a))).toBe(a);
                },
                100
            );
        });

        it('log(0) throws', () => {
            let threw = false;
            try {
                gf256.log(0);
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
        });
    });

    describe('buildMonomial', () => {
        it('monomial(0, c) has degree 0 and coefficient c', () => {
            const mono = gf256.buildMonomial(0, 42);
            expect(mono.getDegree()).toBe(0);
            expect(mono.getCoefficient(0)).toBe(42);
        });

        it('monomial(d, c) has degree d', () => {
            const mono = gf256.buildMonomial(5, 1);
            expect(mono.getDegree()).toBe(5);
        });

        it('monomial(d, 0) is zero polynomial', () => {
            const mono = gf256.buildMonomial(3, 0);
            expect(mono.isZero()).toBe(true);
        });

        it('negative degree throws', () => {
            let threw = false;
            try {
                gf256.buildMonomial(-1, 1);
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
        });
    });
});

describe('GenericGFPoly', () => {

    describe('Construction', () => {
        it('zero coefficients yield zero polynomial', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([0, 0, 0]));
            expect(poly.isZero()).toBe(true);
            expect(poly.getDegree()).toBe(0);
        });

        it('leading zeros are stripped', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([0, 0, 5, 3]));
            expect(poly.getDegree()).toBe(1);
            expect(poly.getCoefficient(1)).toBe(5);
            expect(poly.getCoefficient(0)).toBe(3);
        });

        it('empty coefficients array throws', () => {
            let threw = false;
            try {
                new GenericGFPoly(gf256, new Int32Array(0));
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
        });
    });

    describe('evaluateAt', () => {
        it('evaluateAt(0) returns constant term', () => {
            // p(x) = 3x^2 + 2x + 7
            const poly = new GenericGFPoly(gf256, new Int32Array([3, 2, 7]));
            expect(poly.evaluateAt(0)).toBe(7);
        });

        it('zero polynomial evaluates to 0 everywhere', () => {
            assertProperty(
                [Arbitrary.integer(0, 255)],
                (a) => {
                    expect(gf256.zero.evaluateAt(a)).toBe(0);
                },
                50
            );
        });

        it('evaluateAt(1) equals XOR of all coefficients', () => {
            const coeffs = new Int32Array([5, 12, 200, 33]);
            const poly = new GenericGFPoly(gf256, coeffs);
            let xorSum = 0;
            for (const c of coeffs) xorSum ^= c;
            expect(poly.evaluateAt(1)).toBe(xorSum);
        });
    });

    describe('addOrSubtract (polynomial)', () => {
        it('p + 0 === p', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([5, 3, 1]));
            const result = poly.addOrSubtract(gf256.zero);
            expect(result.getCoefficients()).toEqual(poly.getCoefficients());
        });

        it('p + p === 0 (GF(2^n) self-cancellation)', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([5, 3, 1]));
            const result = poly.addOrSubtract(poly);
            expect(result.isZero()).toBe(true);
        });

        it('commutativity: p + q === q + p', () => {
            const p = new GenericGFPoly(gf256, new Int32Array([1, 2, 3]));
            const q = new GenericGFPoly(gf256, new Int32Array([4, 5]));
            const pq = p.addOrSubtract(q);
            const qp = q.addOrSubtract(p);
            expect(pq.getCoefficients()).toEqual(qp.getCoefficients());
        });
    });

    describe('multiply (polynomial)', () => {
        it('p * 1 === p (scalar identity)', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([5, 3, 1]));
            const result = poly.multiplyScalar(1);
            expect(result.getCoefficients()).toEqual(poly.getCoefficients());
        });

        it('p * 0 === 0 (scalar zero)', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([5, 3, 1]));
            const result = poly.multiplyScalar(0);
            expect(result.isZero()).toBe(true);
        });

        it('degree of product equals sum of degrees', () => {
            const p = new GenericGFPoly(gf256, new Int32Array([1, 2]));    // degree 1
            const q = new GenericGFPoly(gf256, new Int32Array([3, 4, 5])); // degree 2
            const product = p.multiplyGenericGFPoly(q);
            expect(product.getDegree()).toBe(3);
        });

        it('p * zero_poly === zero_poly', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([5, 3, 1]));
            const result = poly.multiplyGenericGFPoly(gf256.zero);
            expect(result.isZero()).toBe(true);
        });
    });

    describe('divide (polynomial)', () => {
        it('quotient and remainder have correct degrees', () => {
            // dividend degree 3, divisor degree 1 → quotient degree 2, remainder degree 0
            const dividend = new GenericGFPoly(gf256, new Int32Array([1, 0, 1, 1]));
            const divisor = new GenericGFPoly(gf256, new Int32Array([1, 1]));
            const [quotient, remainder] = dividend.divide(divisor);

            expect(quotient.getDegree()).toBe(2);
            expect(remainder.getDegree() < divisor.getDegree() || remainder.isZero()).toBe(true);
        });

        it('divisor root zeroes out dividend minus remainder', () => {
            // If divisor(a) == 0 for some 'a', then dividend(a) must equal remainder(a)
            // divisor = x + 1, root in GF(256) is a=1 since 1 XOR 1 = 0
            const dividend = new GenericGFPoly(gf256, new Int32Array([1, 0, 1, 1]));
            const divisor = new GenericGFPoly(gf256, new Int32Array([1, 1]));

            // Verify root: divisor(1) = 1 XOR 1 = 0
            expect(divisor.evaluateAt(1)).toBe(0);

            const [, remainder] = dividend.divide(divisor);
            // At the root, dividend(1) should equal remainder(1)
            expect(dividend.evaluateAt(1)).toBe(remainder.evaluateAt(1));
        });

        it('remainder degree is less than divisor degree', () => {
            const dividend = new GenericGFPoly(gf256, new Int32Array([1, 0, 1, 1, 3]));
            const divisor = new GenericGFPoly(gf256, new Int32Array([1, 1, 1]));
            const [, remainder] = dividend.divide(divisor);

            expect(remainder.getDegree() < divisor.getDegree() || remainder.isZero()).toBe(true);
        });

        it('dividing by zero polynomial throws', () => {
            const poly = new GenericGFPoly(gf256, new Int32Array([1, 2, 3]));
            let threw = false;
            try {
                poly.divide(gf256.zero);
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
        });
    });

    describe('Distributive Law (PBT)', () => {
        it('a * (b + c) === a*b + a*c for field elements', () => {
            assertProperty(
                [Arbitrary.integer(1, 255), Arbitrary.integer(1, 255), Arbitrary.integer(1, 255)],
                (a, b, c) => {
                    const bPlusC = GenericGF.addOrSubtract(b, c);
                    const lhs = gf256.multiply(a, bPlusC);
                    const rhs = GenericGF.addOrSubtract(gf256.multiply(a, b), gf256.multiply(a, c));
                    expect(lhs).toBe(rhs);
                },
                100
            );
        });
    });

    describe('Field Instance Variants', () => {
        it('DATA_MATRIX_FIELD_256 has size 256 and generatorBase 1', () => {
            const dm = GenericGF_DATA_MATRIX_FIELD_256;
            expect(dm.getSize()).toBe(256);
            expect(dm.getGeneratorBase()).toBe(1);
        });

        it('QR_CODE_FIELD_256 has generatorBase 0', () => {
            expect(GenericGF_QR_CODE_FIELD_256.getGeneratorBase()).toBe(0);
        });
    });
});
