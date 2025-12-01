/*
 * Galois Field (GF) arithmetic for Reed-Solomon error correction.
 * Original implementation from ZXing, ported to JavaScript by cho45.
 * Copyright 2007 ZXing authors
 * Licensed under the Apache License, Version 2.0
 */

export class GenericGF {
    constructor(primitive, size, b) {
        this.primitive = primitive;
        this.size = size;
        this.generatorBase = b;

        this.expTable = new Int32Array(size);
        this.logTable = new Int32Array(size);

        let x = 1;
        for (let i = 0; i < size; i++) {
            this.expTable[i] = x;
            x *= 2; // we're assuming the generator alpha is 2
            if (x >= size) {
                x ^= primitive;
                x &= size - 1;
            }
        }
        for (let i = 0; i < size - 1; i++) {
            this.logTable[this.expTable[i]] = i;
        }
        // logTable[0] == 0 but this should never be used

        this.zero = new GenericGFPoly(this, GenericGFPoly.COEFFICIENTS_ZERO);
        this.one = new GenericGFPoly(this, GenericGFPoly.COEFFICIENTS_ONE);
    }

    buildMonomial(degree, coefficient) {
        if (degree < 0) {
            throw new Error("IllegalArgumentException()");
        }
        if (coefficient === 0) {
            return this.zero;
        }
        const coefficients = new Int32Array(degree + 1);
        coefficients[0] = coefficient;
        return new GenericGFPoly(this, coefficients);
    }

    getZero() {
        return this.zero;
    }

    getOne() {
        return this.one;
    }

    exp(a) {
        return this.expTable[a];
    }

    log(a) {
        if (a === 0) {
            throw new Error("IllegalArgumentException()");
        }
        return this.logTable[a];
    }

    inverse(a) {
        if (a === 0) {
            throw new Error("ArithmeticException()");
        }
        return this.expTable[this.size - this.logTable[a] - 1];
    }

    multiply(a, b) {
        if (a === 0 || b === 0) {
            return 0;
        }
        return this.expTable[(this.logTable[a] + this.logTable[b]) % (this.size - 1)];
    }

    getSize() {
        return this.size;
    }

    getGeneratorBase() {
        return this.generatorBase;
    }

    toString() {
        return "GF(0x" + this.primitive.toString(16) + ',' + this.size + ')';
    }

    static addOrSubtract(a, b) {
        return a ^ b;
    }
}

export class GenericGFPoly {
    constructor(field, coefficients) {
        if (coefficients.length === 0) {
            throw new Error("IllegalArgumentException()");
        }
        this.field = field;
        const coefficientsLength = coefficients.length;
        if (coefficientsLength > 1 && coefficients[0] === 0) {
            // Leading term must be non-zero for anything except the constant polynomial "0"
            let firstNonZero = 1;
            while (firstNonZero < coefficientsLength && coefficients[firstNonZero] === 0) {
                firstNonZero++;
            }
            if (firstNonZero == coefficientsLength) {
                this.coefficients = GenericGFPoly.COEFFICIENTS_ZERO;
            } else {
                this.coefficients = coefficients.subarray(firstNonZero, coefficientsLength);
            }
        } else {
            this.coefficients = coefficients;
        }
        this.degree = this.coefficients.length - 1;
    }

    getCoefficients() {
        return this.coefficients;
    }

    getDegree() {
        return this.degree;
    }

    isZero() {
        return this.coefficients[0] === 0;
    }

    getCoefficient(degree) {
        return this.coefficients[this.coefficients.length - 1 - degree];
    }

    evaluateAt(a) {
        if (a === 0) {
            // Just return the x^0 coefficient
            return this.getCoefficient(0);
        }
        const coefficients = this.coefficients;
        const size = coefficients.length;
        let result;
        if (a == 1) {
            // Just the sum of the coefficients
            result = 0;
            for (let i = 0, len = coefficients.length; i < len; i++) {
                result = GenericGF.addOrSubtract(result, coefficients[i]);
            }
            return result;
        }

        result = coefficients[0];
        for (let i = 1; i < size; i++) {
            result = GenericGF.addOrSubtract(this.field.multiply(a, result), coefficients[i]);
        }
        return result;
    }

    addOrSubtract(other, buf) {
        if (this.field !== other.field) {
            throw new Error('IllegalArgumentException("GenericGFPolys do not have same GenericGF field")');
        }
        if (this.isZero()) {
            return other;
        }
        if (other.isZero()) {
            return this;
        }

        let smallerCoefficients = this.coefficients;
        let largerCoefficients = other.coefficients;
        if (smallerCoefficients.length > largerCoefficients.length) {
            const temp = smallerCoefficients;
            smallerCoefficients = largerCoefficients;
            largerCoefficients = temp;
        }
        const sumDiff = buf ? buf.subarray(0, largerCoefficients.length) : new Int32Array(largerCoefficients.length);
        const lengthDiff = largerCoefficients.length - smallerCoefficients.length;
        for (let i = lengthDiff; i < largerCoefficients.length; i++) {
            sumDiff[i] = GenericGF.addOrSubtract(smallerCoefficients[i - lengthDiff], largerCoefficients[i]);
        }
        // Copy high-order terms only found in higher-degree polynomial's coefficients
        sumDiff.set(largerCoefficients.subarray(0, lengthDiff));

        return new GenericGFPoly(this.field, sumDiff);
    }

    multiply(other) {
        if (other instanceof GenericGFPoly) {
            return this.multiplyGenericGFPoly(other);
        } else {
            return this.multiplyScalar(other);
        }
    }

    multiplyGenericGFPoly(other) {
        if (this.field !== other.field) {
            throw new Error('IllegalArgumentException("GenericGFPolys do not have same GenericGF field")');
        }
        if (this.isZero() || other.isZero()) {
            return this.field.zero;
        }
        const aCoefficients = this.coefficients;
        const aLength = aCoefficients.length;
        const bCoefficients = other.coefficients;
        const bLength = bCoefficients.length;
        const product = new Int32Array(aLength + bLength - 1);
        for (let i = 0; i < aLength; i++) {
            const aCoeff = aCoefficients[i];
            for (let j = 0; j < bLength; j++) {
                product[i + j] = GenericGF.addOrSubtract(product[i + j], this.field.multiply(aCoeff, bCoefficients[j]));
            }
        }
        return new GenericGFPoly(this.field, product);
    }

    multiplyScalar(scalar) {
        if (scalar === 0) {
            return this.field.zero;
        }
        if (scalar == 1) {
            return this;
        }
        const size = this.coefficients.length;
        const product = new Int32Array(size);
        for (let i = 0; i < size; i++) {
            product[i] = this.field.multiply(this.coefficients[i], scalar);
        }
        return new GenericGFPoly(this.field, product);
    }

    multiplyByMonomial(degree, coefficient) {
        if (degree < 0) {
            throw new Error('IllegalArgumentException()');
        }
        if (coefficient === 0) {
            return this.field.zero;
        }
        const size = this.coefficients.length;
        const product = new Int32Array(size + degree);
        for (let i = 0; i < size; i++) {
            product[i] = this.field.multiply(this.coefficients[i], coefficient);
        }
        return new GenericGFPoly(this.field, product);
    }

    divide(other) {
        if (this.field !== other.field) {
            throw new Error('IllegalArgumentException("GenericGFPolys do not have same GenericGF field")');
        }
        if (other.isZero()) {
            throw new Error('IllegalArgumentException("Divide by 0")');
        }

        let quotient = this.field.getZero();
        let remainder = this;

        const denominatorLeadingTerm = other.getCoefficient(other.degree);
        const inverseDenominatorLeadingTerm = this.field.inverse(denominatorLeadingTerm);

        while (remainder.degree >= other.degree && !remainder.isZero()) {
            const degreeDifference = remainder.degree - other.degree;
            const scale = this.field.multiply(remainder.getCoefficient(remainder.degree), inverseDenominatorLeadingTerm);
            const term = other.multiplyByMonomial(degreeDifference, scale);
            const iterationQuotient = this.field.buildMonomial(degreeDifference, scale);
            quotient = quotient.addOrSubtract(iterationQuotient, quotient.coefficients);
            remainder = remainder.addOrSubtract(term, remainder.coefficients);
        }

        return [quotient, remainder];
    }

    toString() {
        let result = '';
        for (let degree = this.degree; degree >= 0; degree--) {
            let coefficient = this.getCoefficient(degree);
            if (coefficient !== 0) {
                if (coefficient < 0) {
                    result += " - ";
                    coefficient = -coefficient;
                } else {
                    if (result.length > 0) {
                        result += " + ";
                    }
                }
                if (degree === 0 || coefficient != 1) {
                    const alphaPower = this.field.log(coefficient);
                    if (alphaPower === 0) {
                        result += '1';
                    } else if (alphaPower == 1) {
                        result += 'a';
                    } else {
                        result += "a^";
                        result += alphaPower;
                    }
                }
                if (degree !== 0) {
                    if (degree == 1) {
                        result += 'x';
                    } else {
                        result += "x^";
                        result += degree;
                    }
                }
            }
        }
        return result.toString();
    }
}
GenericGFPoly.COEFFICIENTS_ZERO = new Int32Array([0]);
GenericGFPoly.COEFFICIENTS_ONE = new Int32Array([1]);

// Predefined GF(256) fields for common use cases
export const GenericGF_AZTEC_DATA_12 = new GenericGF(0x1069, 4096, 1); // x^12 + x^6 + x^5 + x^3 + 1
export const GenericGF_AZTEC_DATA_10 = new GenericGF(0x409, 1024, 1); // x^10 + x^3 + 1
export const GenericGF_AZTEC_DATA_6 = new GenericGF(0x43, 64, 1); // x^6 + x + 1
export const GenericGF_AZTEC_PARAM = new GenericGF(0x13, 16, 1); // x^4 + x + 1
export const GenericGF_QR_CODE_FIELD_256 = new GenericGF(0x011D, 256, 0); // x^8 + x^4 + x^3 + x^2 + 1
export const GenericGF_DATA_MATRIX_FIELD_256 = new GenericGF(0x012D, 256, 1); // x^8 + x^5 + x^3 + x^2 + 1
export const GenericGF_AZTEC_DATA_8 = GenericGF_DATA_MATRIX_FIELD_256;
export const GenericGF_MAXICODE_FIELD_64 = GenericGF_AZTEC_DATA_6;
