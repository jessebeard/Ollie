// Node.js test runner implementation

let currentSuite = null;
let stats = { total: 0, passed: 0, failed: 0 };

export function describe(name, fn) {
    console.log(`\n\x1b[1m${name}\x1b[0m`);
    currentSuite = name;
    try {
        fn();
    } catch (e) {
        console.error(`\x1b[31mSuite Error: ${e.message}\x1b[0m`);
    }
    currentSuite = null;
}

export function it(name, fn) {
    stats.total++;
    try {
        fn();
        stats.passed++;
        console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } catch (e) {
        stats.failed++;
        console.error(`  \x1b[31m✗\x1b[0m ${name}`);
        console.error(`    \x1b[90m${e.message}\x1b[0m`);
    }
}

export function expect(actual) {
    return {
        toBe: (expected) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected} but got ${actual}`);
            }
        },
        toEqual: (expected) => {
            const actualStr = JSON.stringify(actual);
            const expectedStr = JSON.stringify(expected);
            if (actualStr !== expectedStr) {
                throw new Error(`Expected ${expectedStr} but got ${actualStr}`);
            }
        },
        toBeCloseTo: (expected, precision = 2) => {
            const diff = Math.abs(actual - expected);
            const tolerance = Math.pow(10, -precision) / 2;
            if (diff > tolerance) {
                throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff})`);
            }
        },
        toBeGreaterThan: (expected) => {
            if (!(actual > expected)) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeLessThan: (expected) => {
            if (!(actual < expected)) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        toBeDefined: () => {
            if (typeof actual === 'undefined') {
                throw new Error(`Expected value to be defined`);
            }
        }
    };
}

export function getStats() {
    return stats;
}

export function resetStats() {
    stats = { total: 0, passed: 0, failed: 0 };
}
