/**
 * Property-Based Testing (PBT) Harness with Counterexample Shrinking
 *
 * Generates random values and runs properties against them for a specified number
 * of iterations. When a property fails, automatically shrinks the failing inputs
 * to the minimal counterexample.
 *
 * Each Arbitrary generator returns an object: { generate(), shrink(value) }
 * - generate(): produces a random value
 * - shrink(value): yields progressively smaller candidate values
 */

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}

// --- Shrinking Strategies ---

/**
 * Shrinks an integer toward zero by halving the distance.
 * @param {number} value - The integer to shrink
 * @param {number} min - Lower bound
 * @param {number} max - Upper bound
 * @returns {number[]} Array of shrink candidates, smallest first
 */
function shrinkInteger(value, min, max) {
    const candidates = [];
    if (value === 0) return candidates;

    // Try zero first (if in range)
    if (min <= 0 && max >= 0) candidates.push(0);

    // Halve toward zero
    let current = value;
    for (let i = 0; i < 8; i++) {
        current = (current / 2) | 0;
        if (current >= min && current <= max && current !== value) {
            candidates.push(current);
        }
        if (current === 0) break;
    }

    // Try value - 1 (if in range)
    const pred = value > 0 ? value - 1 : value + 1;
    if (pred >= min && pred <= max && pred !== value && !candidates.includes(pred)) {
        candidates.push(pred);
    }

    return candidates;
}

/**
 * Shrinks a Uint8Array by reducing length and simplifying byte values.
 * @param {Uint8Array} value - The array to shrink
 * @param {number} minLength - Minimum allowed length
 * @returns {Uint8Array[]} Array of shrink candidates
 */
function shrinkByteArray(value, minLength) {
    const candidates = [];
    const len = value.length;

    // Try empty (if allowed)
    if (minLength === 0 && len > 0) {
        candidates.push(new Uint8Array(0));
    }

    // Halve length (keep first half, then second half)
    if (len > minLength + 1) {
        const half = Math.max(Math.floor(len / 2), minLength);
        candidates.push(value.slice(0, half));
        candidates.push(value.slice(len - half));
    }

    // Remove one element at a time (up to 4 attempts)
    for (let i = 0; i < Math.min(len, 4); i++) {
        if (len - 1 >= minLength) {
            const reduced = new Uint8Array(len - 1);
            reduced.set(value.subarray(0, i));
            reduced.set(value.subarray(i + 1), i);
            candidates.push(reduced);
        }
    }

    // Zero out bytes (keep length, simplify content)
    if (len > 0) {
        const zeroed = new Uint8Array(len);
        candidates.push(zeroed);

        // Zero first half
        const halfZeroed = new Uint8Array(value);
        const halfLen = Math.floor(len / 2);
        for (let i = 0; i < halfLen; i++) halfZeroed[i] = 0;
        candidates.push(halfZeroed);
    }

    return candidates;
}

/**
 * Shrinks a string by reducing length and simplifying characters.
 * @param {string} value - The string to shrink
 * @param {number} minLength - Minimum allowed length
 * @returns {string[]} Array of shrink candidates
 */
function shrinkString(value, minLength) {
    const candidates = [];
    const len = value.length;

    // Try empty (if allowed)
    if (minLength === 0 && len > 0) {
        candidates.push('');
    }

    // Halve length
    if (len > minLength + 1) {
        const half = Math.max(Math.floor(len / 2), minLength);
        candidates.push(value.slice(0, half));
        candidates.push(value.slice(len - half));
    }

    // Try single character (if allowed)
    if (len > 1 && minLength <= 1) {
        candidates.push(value[0]);
    }

    // Simplify to 'a' characters (keep length)
    if (len > 0) {
        candidates.push('a'.repeat(len));
    }

    return candidates;
}

/**
 * Shrinks a generic array by reducing length.
 * @param {Array} value - The array to shrink
 * @param {number} minLength - Minimum allowed length
 * @returns {Array[]} Array of shrink candidates
 */
function shrinkArray(value, minLength) {
    const candidates = [];
    const len = value.length;

    if (minLength === 0 && len > 0) {
        candidates.push([]);
    }

    if (len > minLength + 1) {
        const half = Math.max(Math.floor(len / 2), minLength);
        candidates.push(value.slice(0, half));
        candidates.push(value.slice(len - half));
    }

    return candidates;
}

// --- Arbitrary Generators ---

export const Arbitrary = {
    integer: (min = -1000, max = 1000) => ({
        generate: () => getRandomInt(min, max),
        shrink: (value) => shrinkInteger(value, min, max)
    }),

    positiveInteger: (max = 10000) => ({
        generate: () => getRandomInt(1, max),
        shrink: (value) => shrinkInteger(value, 1, max)
    }),

    byte: () => ({
        generate: () => getRandomInt(0, 256),
        shrink: (value) => shrinkInteger(value, 0, 255)
    }),

    byteArray: (minLength = 1, maxLength = 1024) => ({
        generate: () => {
            const len = getRandomInt(minLength, maxLength);
            const arr = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                arr[i] = getRandomInt(0, 256);
            }
            return arr;
        },
        shrink: (value) => shrinkByteArray(value, minLength)
    }),

    string: (minLength = 1, maxLength = 100) => ({
        generate: () => {
            const len = getRandomInt(minLength, maxLength);
            let str = '';
            // Including ASCII, extended Latin, common Unicode symbols, and some emojis
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+ ãñéöçµœ∑®†¥¨ˆøπ“‘—🤪🚀🔥💻';
            for (let i = 0; i < len; i++) {
                // Mix in random unicode ranges occasionally to really fuzz UTF-8 boundaries
                if (Math.random() < 0.1) {
                    // Generate random valid unicode code point (avoiding surrogates 0xD800-0xDFFF)
                    let codePoint;
                    if (Math.random() < 0.5) {
                        codePoint = getRandomInt(0x0800, 0xD7FF);
                    } else {
                        codePoint = getRandomInt(0xE000, 0xFFFF);
                    }
                    str += String.fromCodePoint(codePoint);
                } else {
                    str += chars.charAt(getRandomInt(0, chars.length));
                }
            }
            return str;
        },
        shrink: (value) => shrinkString(value, minLength)
    }),

    boolean: () => ({
        generate: () => Math.random() > 0.5,
        shrink: (value) => value ? [false] : []
    }),

    array: (arbitraryGen, minLength = 0, maxLength = 50) => ({
        generate: () => {
            // Resolve the element generator: supports { generate } objects and plain functions
            const genFn = (arbitraryGen && typeof arbitraryGen.generate === 'function')
                ? () => arbitraryGen.generate()
                : (typeof arbitraryGen === 'function' ? arbitraryGen : () => arbitraryGen);
            const len = getRandomInt(minLength, maxLength);
            const arr = new Array(len);
            for (let i = 0; i < len; i++) {
                arr[i] = genFn();
            }
            return arr;
        },
        shrink: (value) => shrinkArray(value, minLength)
    })
};

// --- Shrinking Engine ---

const MAX_SHRINK_ROUNDS = 50;

/**
 * Attempts to shrink a failing set of arguments to the smallest counterexample.
 * @param {Array<{generate, shrink}>} arbitraries - The generators (with shrink functions)
 * @param {Function} propertyFn - The property function
 * @param {Array} failingArgs - The original failing arguments
 * @returns {Promise<{args: Array, error: Error}>} The smallest counterexample found
 */
async function shrinkCounterexample(arbitraries, propertyFn, failingArgs, originalError) {
    let smallestArgs = failingArgs;
    let smallestError = originalError;
    let improved = true;
    let rounds = 0;

    while (improved && rounds < MAX_SHRINK_ROUNDS) {
        improved = false;
        rounds++;

        // Try shrinking each argument position independently
        for (let argIdx = 0; argIdx < smallestArgs.length; argIdx++) {
            const arb = arbitraries[argIdx];
            if (!arb.shrink) continue;

            const candidates = arb.shrink(smallestArgs[argIdx]);

            for (const candidate of candidates) {
                const testArgs = [...smallestArgs];
                testArgs[argIdx] = candidate;

                try {
                    const result = await propertyFn(...testArgs);
                    if (result === false) {
                        // Still fails — this is a smaller counterexample
                        smallestArgs = testArgs;
                        smallestError = new Error('Property returned false.');
                        improved = true;
                        break;
                    }
                    // Property passed with smaller input — not a valid shrink
                } catch (e) {
                    // Still fails — this is a smaller counterexample
                    smallestArgs = testArgs;
                    smallestError = e;
                    improved = true;
                    break;
                }
            }

            if (improved) break; // Restart from first arg with new smallest
        }
    }

    return { args: smallestArgs, error: smallestError, shrinkRounds: rounds };
}

// --- Property Assertion ---

/**
 * Formats a value for display in counterexample output.
 * Truncates large byte arrays and deeply nested objects.
 */
function formatValue(value) {
    if (value instanceof Uint8Array) {
        if (value.length <= 20) {
            return `Uint8Array(${value.length}) [${Array.from(value).join(', ')}]`;
        }
        return `Uint8Array(${value.length}) [${Array.from(value.slice(0, 10)).join(', ')}, ... ${value.length - 10} more]`;
    }
    if (Array.isArray(value)) {
        if (value.length <= 10) return JSON.stringify(value);
        return `Array(${value.length}) [${JSON.stringify(value.slice(0, 5)).slice(1, -1)}, ... ${value.length - 5} more]`;
    }
    if (typeof value === 'string' && value.length > 50) {
        return `"${value.slice(0, 50)}..." (${value.length} chars)`;
    }
    return JSON.stringify(value);
}

/**
 * Runs a property test with automatic counterexample shrinking.
 * @param {Array<{generate, shrink}>} arbitraries - Array of generator objects from the `Arbitrary` namespace.
 * @param {Function} propertyFn - The function defining the invariant property. Should throw or return false on failure.
 * @param {number} iterations - How many random samples to generate and test.
 */
export async function assertProperty(arbitraries, propertyFn, iterations = 100) {
    for (let i = 0; i < iterations; i++) {
        const args = arbitraries.map(arb =>
            typeof arb.generate === 'function' ? arb.generate() : arb()
        );

        try {
            const result = await propertyFn(...args);
            if (result === false) {
                throw new Error('Property returned false.');
            }
        } catch (error) {
            // --- Shrinking Phase ---
            const hasShrink = arbitraries.some(arb => typeof arb.shrink === 'function');

            if (hasShrink) {
                console.error(`\n[PBT] Property failed at iteration ${i + 1}/${iterations}. Shrinking...`);

                const { args: shrunkArgs, error: shrunkError, shrinkRounds } =
                    await shrinkCounterexample(arbitraries, propertyFn, args, error);

                console.error(`[PBT] Shrunk in ${shrinkRounds} round(s).`);
                console.error(`[PBT] Minimal counterexample:`);
                shrunkArgs.forEach((arg, idx) => {
                    console.error(`  arg[${idx}]: ${formatValue(arg)}`);
                });
                console.error(`[PBT] Error: ${shrunkError.message}`);

                throw new Error(
                    `Property failed. Minimal counterexample after ${shrinkRounds} shrink round(s): ` +
                    `[${shrunkArgs.map(formatValue).join(', ')}] — ${shrunkError.message}`
                );
            } else {
                // No shrinking available — fall back to raw report
                console.error(`\n[PBT Failure] Failed at iteration ${i + 1}/${iterations}`);
                console.error(`Generated Inputs:`, args);
                console.error(`Error:`, error);
                throw new Error(`Property failed for generated inputs: ${error.message}`);
            }
        }
    }
}
