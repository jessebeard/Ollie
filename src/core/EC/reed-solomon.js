/*
 * Reed-Solomon error correction encoder and decoder.
 * Original implementation from ZXing, ported to JavaScript by cho45.
 * Copyright 2007 ZXing authors
 * Licensed under the Apache License, Version 2.0
 */

import { GenericGF, GenericGFPoly } from './galois-field.js';

export class ReedSolomonEncoder {
    constructor(field) {
        this.field = field;
        this.cachedGenerators = [];
        this.cachedGenerators.push(new GenericGFPoly(field, new Int32Array([1])));
    }

    buildGenerator(degree) {
        if (degree >= this.cachedGenerators.length) {
            let lastGenerator = this.cachedGenerators[this.cachedGenerators.length - 1];
            for (let d = this.cachedGenerators.length; d <= degree; d++) {
                const nextGenerator = lastGenerator.multiply(new GenericGFPoly(this.field, new Int32Array([1, this.field.exp(d - 1 + this.field.generatorBase)])));
                this.cachedGenerators.push(nextGenerator);
                lastGenerator = nextGenerator;
            }
        }
        return this.cachedGenerators[degree];
    }

    encode(toEncode, ecBytes) {
        if (ecBytes === 0) {
            throw new Error('IllegalArgumentException("No error correction bytes")');
        }
        const dataBytes = toEncode.length - ecBytes;
        if (dataBytes <= 0) {
            throw new Error('IllegalArgumentException("No data bytes provided")');
        }
        const generator = this.buildGenerator(ecBytes);
        const infoCoefficients = new Int32Array(dataBytes);
        infoCoefficients.set(toEncode.subarray(0, dataBytes));

        let info = new GenericGFPoly(this.field, infoCoefficients);
        info = info.multiplyByMonomial(ecBytes, 1);
        const remainder = info.divide(generator)[1];
        const coefficients = remainder.coefficients;
        const numZeroCoefficients = ecBytes - coefficients.length;
        for (let i = 0; i < numZeroCoefficients; i++) {
            toEncode[dataBytes + i] = 0;
        }
        toEncode.set(coefficients.subarray(0, coefficients.length), dataBytes + numZeroCoefficients);
    }
}

export class ReedSolomonDecoder {
    constructor(field) {
        this.field = field;
    }

    decode(received, twoS) {
        const poly = new GenericGFPoly(this.field, received);
        const syndromeCoefficients = new Int32Array(twoS);
        let noError = true;
        for (let i = 0; i < twoS; i++) {
            const eval_ = poly.evaluateAt(this.field.exp(i + this.field.generatorBase));
            syndromeCoefficients[syndromeCoefficients.length - 1 - i] = eval_;
            if (eval_ !== 0) {
                noError = false;
            }
        }

        if (noError) {
            return;
        }
        const syndrome = new GenericGFPoly(this.field, syndromeCoefficients);
        const sigmaOmega = this.runEuclideanAlgorithm(this.field.buildMonomial(twoS, 1), syndrome, twoS);
        const sigma = sigmaOmega[0];
        const omega = sigmaOmega[1];
        const errorLocations = this.findErrorLocations(sigma);
        const errorMagnitudes = this.findErrorMagnitudes(omega, errorLocations);
        for (let i = 0; i < errorLocations.length; i++) {
            const position = received.length - 1 - this.field.log(errorLocations[i]);
            if (position < 0) {
                throw new Error('ReedSolomonException("Bad error location")');
            }
            received[position] = GenericGF.addOrSubtract(received[position], errorMagnitudes[i]);
        }
    }

    runEuclideanAlgorithm(a, b, R) {
        // Assume a's degree is >= b's
        if (a.degree < b.degree) {
            const temp = a;
            a = b;
            b = temp;
        }

        let rLast = a;
        let r = b;
        let tLast = this.field.zero;
        let t = this.field.one;

        // Run Euclidean algorithm until r's degree is less than R/2
        while (r.degree >= R / 2) {
            const rLastLast = rLast;
            const tLastLast = tLast;
            rLast = r;
            tLast = t;

            // Divide rLastLast by rLast, with quotient in q and remainder in r
            if (rLast.isZero()) {
                // Oops, Euclidean algorithm already terminated?
                throw new Error('ReedSolomonException("r_{i-1} was zero")');
            }
            r = rLastLast;
            let q = this.field.zero;
            const denominatorLeadingTerm = rLast.getCoefficient(rLast.degree);
            const dltInverse = this.field.inverse(denominatorLeadingTerm);
            while (r.degree >= rLast.degree && !r.isZero()) {
                const degreeDiff = r.degree - rLast.degree;
                const scale = this.field.multiply(r.getCoefficient(r.degree), dltInverse);
                q = q.addOrSubtract(this.field.buildMonomial(degreeDiff, scale));
                r = r.addOrSubtract(rLast.multiplyByMonomial(degreeDiff, scale));
            }

            t = q.multiply(tLast).addOrSubtract(tLastLast);

            if (r.degree >= rLast.degree) {
                throw new Error('IllegalStateException("Division algorithm failed to reduce polynomial?")');
            }
        }

        const sigmaTildeAtZero = t.getCoefficient(0);
        if (sigmaTildeAtZero === 0) {
            throw new Error('ReedSolomonException("sigmaTilde(0) was zero")');
        }

        const inverse = this.field.inverse(sigmaTildeAtZero);
        const sigma = t.multiply(inverse);
        const omega = r.multiply(inverse);
        return [sigma, omega];
    }

    findErrorLocations(errorLocator) {
        // This is a direct application of Chien's search
        const numErrors = errorLocator.degree;
        if (numErrors == 1) { // shortcut
            return new Int32Array([errorLocator.getCoefficient(1)]);
        }
        const result = new Int32Array(numErrors);
        let e = 0;
        for (let i = 1; i < this.field.size && e < numErrors; i++) {
            if (errorLocator.evaluateAt(i) === 0) {
                result[e] = this.field.inverse(i);
                e++;
            }
        }
        if (e != numErrors) {
            throw new Error('ReedSolomonException("Error locator degree does not match number of roots")');
        }
        return result;
    }

    findErrorMagnitudes(errorEvaluator, errorLocations) {
        // This is directly applying Forney's Formula
        const s = errorLocations.length;
        const result = new Int32Array(s);
        for (let i = 0; i < s; i++) {
            const xiInverse = this.field.inverse(errorLocations[i]);
            let denominator = 1;
            for (let j = 0; j < s; j++) {
                if (i != j) {
                    denominator = this.field.multiply(denominator, GenericGF.addOrSubtract(1, this.field.multiply(errorLocations[j], xiInverse)));
                }
            }
            result[i] = this.field.multiply(errorEvaluator.evaluateAt(xiInverse), this.field.inverse(denominator));
            if (this.field.generatorBase !== 0) {
                result[i] = this.field.multiply(result[i], xiInverse);
            }
        }
        return result;
    }
}
