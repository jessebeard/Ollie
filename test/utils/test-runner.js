// Environment-aware test runner
// Implements describe/it/expect for both Node and browser

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Stats tracking (Node only)
let stats = { total: 0, passed: 0, failed: 0 };
let currentSuite = null;

// --- describe function ---
export async function describe(name, fn) {
    if (isNode) {
        // Node.js implementation
        console.log(`\n\x1b[1m${name}\x1b[0m`);
        currentSuite = name;
        try {
            await fn();
        } catch (e) {
            console.error(`\x1b[31mSuite Error: ${e.message}\x1b[0m`);
        }
        currentSuite = null;
    } else {
        // Browser implementation
        const runSuite = () => {
            const container = document.createElement('div');
            container.className = 'suite';
            container.innerHTML = `<h3>${name}</h3>`;

            const parent = window.__currentSuite || document.getElementById('test-results') || document.body;
            parent.appendChild(container);

            const previousSuite = window.__currentSuite;
            window.__currentSuite = container;

            try {
                fn();
            } catch (e) {
                console.error(e);
                container.innerHTML += `<div class="error">Suite Error: ${e.message}</div>`;
            }

            window.__currentSuite = previousSuite;
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runSuite);
        } else {
            runSuite();
        }
    }
}

// --- it function ---
export async function it(name, fn) {
    if (isNode) {
        // Node.js implementation
        stats.total++;
        try {
            await fn();
            stats.passed++;
            console.log(`  \x1b[32m✓\x1b[0m ${name}`);
        } catch (e) {
            stats.failed++;
            console.error(`  \x1b[31m✗\x1b[0m ${name}`);
            console.error(`    \x1b[90m${e.message}\x1b[0m`);
        }
    } else {
        // Browser implementation
        const suite = window.__currentSuite || document.body;
        const resultDiv = document.createElement('div');
        resultDiv.className = 'test-case';
        resultDiv.textContent = `⏳ ${name}...`;
        suite.appendChild(resultDiv);

        try {
            await fn();
            resultDiv.classList.add('pass');
            resultDiv.textContent = `✓ ${name}`;
            console.log(`PASS: ${name}`);
        } catch (e) {
            resultDiv.classList.add('fail');
            resultDiv.textContent = `✗ ${name}: ${e.message}`;
            console.error(`FAIL: ${name}`, e);
        }
    }
}

// --- expect function ---
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
        toBeGreaterThanOrEqual: (expected) => {
            if (!(actual >= expected)) {
                throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
            }
        },
        toBeLessThan: (expected) => {
            if (!(actual < expected)) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        toBeLessThanOrEqual: (expected) => {
            if (!(actual <= expected)) {
                throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
            }
        },
        toBeDefined: () => {
            if (typeof actual === 'undefined') {
                throw new Error(`Expected value to be defined`);
            }
        },
        not: {
            toBe: (expected) => {
                if (actual === expected) {
                    throw new Error(`Expected ${actual} not to be ${expected}`);
                }
            }
        }
    };
}

// --- Stats functions (Node only) ---
export function getStats() {
    return { ...stats };
}

export function resetStats() {
    stats = { total: 0, passed: 0, failed: 0 };
}
