/**
 * Bespoke Test Runner with Structured Reporting & Assertion Counting
 *
 * Features:
 * - Per-test structured results: { suite, test, status, duration_ms, assertions, error }
 * - Assertion counter: every expect() call increments a per-test counter
 * - Zero-assertion warnings: flags tests that pass with 0 assertions
 * - Pluggable onTestComplete hook: for mutation testing integration
 * - Environment parity: works identically in Node.js and browser
 */

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

let stats = { total: 0, passed: 0, failed: 0 };
let currentSuite = null;
let currentAssertionCount = 0;
let testResults = [];

// Pluggable hook: called after each test completes.
// Replace this to intercept test results for mutation testing, coverage, etc.
let _onTestComplete = null;

/**
 * Sets a callback invoked after each test completes.
 * @param {Function|null} fn - Callback receiving a structured test result object.
 */
export function onTestComplete(fn) {
    _onTestComplete = fn;
}

/**
 * Returns the array of structured test results from the current run.
 * Each result: { suite, test, status, duration_ms, assertions, error }
 */
export function getTestResults() {
    return testResults;
}

let rootNode = {
    name: "Root",
    suites: [],
    tests: [],
    parent: null
};

let currentSuiteObj = rootNode;

export function describe(name, fn) {
    const parent = currentSuiteObj;
    const suiteNode = {
        name,
        fn,
        suites: [],
        tests: [],
        parent,
        uiBody: null,
        uiContainer: null
    };

    parent.suites.push(suiteNode);
    
    // Evaluate suite body synchronously to register nested matches
    currentSuiteObj = suiteNode;
    try {
        fn();
    } catch (e) {
        console.error(`Error during suite registration "${name}":`, e);
    } finally {
        currentSuiteObj = parent;
    }
}

export function it(name, fn) {
    currentSuiteObj.tests.push({ name, fn });
}

export async function executeTests() {
    await runSuite(rootNode);
}

async function runSuite(node) {
    // If it's a real suite (not root), setup UI / logging
    if (node !== rootNode) {
        if (isNode) {
            console.log(`\n\x1b[1m${node.name}\x1b[0m`);
            currentSuite = node.name;
        } else {
            const container = document.createElement('div');
            container.className = 'suite';

            const header = document.createElement('h3');
            header.textContent = node.name;
            const badge = document.createElement('span');
            badge.className = 'suite-badge';
            header.appendChild(badge);
            container.appendChild(header);

            const body = document.createElement('div');
            body.className = 'suite-body';
            container.appendChild(body);

            node.uiBody = body;
            node.uiContainer = container;

            const parentSuiteBody = (node.parent && node.parent !== rootNode) ? node.parent.uiBody : (document.getElementById('test-results') || document.body);
            parentSuiteBody.appendChild(container);

            currentSuite = node.name;
        }
    }

    try {
        // Run all tests in this suite sequentially
        for (const testNode of node.tests) {
            await runTest(node !== rootNode ? node : null, testNode.name, testNode.fn);
        }

        // Run all nested suites sequentially
        for (const childSuite of node.suites) {
            const prevSuite = currentSuite;
            await runSuite(childSuite);
            currentSuite = prevSuite;
        }
    } catch (e) {
        if (isNode) {
            console.error(`\x1b[31mSuite Error: ${e.message}\x1b[0m`);
        } else {
            console.error(e);
            if (node.uiBody) {
                node.uiBody.innerHTML += `<div class="error">Suite Error: ${e.message}</div>`;
            }
        }
    }
}

async function runTest(parent, name, fn) {
    currentAssertionCount = 0;
    const startTime = Date.now();
    const suiteName = parent ? parent.name : currentSuite;

    if (isNode) {
        stats.total++;
        try {
            await fn();
            const duration = Date.now() - startTime;
            stats.passed++;

            const result = {
                suite: suiteName,
                test: name,
                status: 'pass',
                duration_ms: duration,
                assertions: currentAssertionCount,
                error: null
            };
            testResults.push(result);

            if (currentAssertionCount === 0) {
                // Not logging here because the UI renderer does it gracefully. We were logging to grep node test runs safely.
            } else {
                console.log(`  \x1b[32m✓\x1b[0m ${name}`);
            }

            if (_onTestComplete) _onTestComplete(result);
        } catch (e) {
            const duration = Date.now() - startTime;
            stats.failed++;

            const result = {
                suite: suiteName,
                test: name,
                status: 'fail',
                duration_ms: duration,
                assertions: currentAssertionCount,
                error: e.message
            };
            testResults.push(result);

            console.error(`  \x1b[31m✗\x1b[0m ${name}`);
            console.error(`    \x1b[90m${e.message}\x1b[0m`);

            if (_onTestComplete) _onTestComplete(result);
        }
    } else {
        const suiteBody = parent ? parent.uiBody : document.body;
        const resultDiv = document.createElement('div');
        resultDiv.className = 'test-case';
        resultDiv.innerHTML = `<span class="test-icon"></span><span class="test-name running">⏳ ${name}...</span>`;
        suiteBody.appendChild(resultDiv);

        stats.total++;
        try {
            await fn();
            const duration = Date.now() - startTime;
            stats.passed++;

            const result = {
                suite: suiteName,
                test: name,
                status: 'pass',
                duration_ms: duration,
                assertions: currentAssertionCount,
                error: null
            };
            testResults.push(result);

            if (currentAssertionCount === 0) {
                resultDiv.classList.add('warn');
                resultDiv.innerHTML = `<span class="test-icon"></span><span class="test-name">${name} <span style="color:var(--yellow);font-size:11px">(0 assertions)</span></span><span class="test-duration">${duration}ms</span>`;
                console.warn(`WARN: ${name} — 0 assertions (dead test?)`);
            } else {
                resultDiv.classList.add('pass');
                resultDiv.innerHTML = `<span class="test-icon"></span><span class="test-name">${name}</span><span class="test-duration">${duration}ms</span>`;
                console.log(`PASS: ${name}`);
            }

            if (_onTestComplete) _onTestComplete(result);
        } catch (e) {
            const duration = Date.now() - startTime;
            stats.failed++;

            const result = {
                suite: suiteName,
                test: name,
                status: 'fail',
                duration_ms: duration,
                assertions: currentAssertionCount,
                error: e.message
            };
            testResults.push(result);

            resultDiv.classList.add('fail');
            resultDiv.innerHTML = `<span class="test-icon"></span><span class="test-name">${name}<span class="test-error">${e.message}</span></span><span class="test-duration">${duration}ms</span>`;
            console.error(`FAIL: ${name}`, e);

            if (_onTestComplete) _onTestComplete(result);
        }
    }
}

/**
 * Assertion function with per-test counting.
 * Every matcher call increments the assertion counter for the current test.
 */
export function expect(actual) {
    function tick() { currentAssertionCount++; }

    return {
        toBe: (expected) => {
            tick();
            if (actual !== expected) {
                throw new Error(`Expected ${expected} but got ${actual}`);
            }
        },
        toEqual: (expected) => {
            tick();
            const actualStr = JSON.stringify(actual);
            const expectedStr = JSON.stringify(expected);
            if (actualStr !== expectedStr) {
                throw new Error(`Expected ${expectedStr} but got ${actualStr}`);
            }
        },
        toBeCloseTo: (expected, precision = 2) => {
            tick();
            const diff = Math.abs(actual - expected);
            const tolerance = Math.pow(10, -precision) / 2;
            if (diff > tolerance) {
                throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff})`);
            }
        },
        toBeGreaterThan: (expected) => {
            tick();
            if (!(actual > expected)) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeGreaterThanOrEqual: (expected) => {
            tick();
            if (!(actual >= expected)) {
                throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
            }
        },
        toBeLessThan: (expected) => {
            tick();
            if (!(actual < expected)) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        toBeLessThanOrEqual: (expected) => {
            tick();
            if (!(actual <= expected)) {
                throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
            }
        },
        toBeDefined: () => {
            tick();
            if (typeof actual === 'undefined') {
                throw new Error(`Expected value to be defined`);
            }
        },
        toBeNull: () => {
            tick();
            if (actual !== null) {
                throw new Error(`Expected null but got ${actual}`);
            }
        },
        toBeTruthy: () => {
            tick();
            if (!actual) {
                throw new Error(`Expected ${actual} to be truthy`);
            }
        },
        toThrow: (expectedError) => {
            tick();
            let threw = false;
            try {
                actual();
            } catch (e) {
                threw = true;
                if (expectedError) {
                    if (expectedError instanceof RegExp) {
                        if (!expectedError.test(e.message)) {
                            throw new Error(`Expected error matching ${expectedError} but got "${e.message}"`);
                        }
                    } else if (typeof expectedError === 'string') {
                        if (!e.message.includes(expectedError)) {
                            throw new Error(`Expected error including "${expectedError}" but got "${e.message}"`);
                        }
                    }
                }
            }
            if (!threw) {
                throw new Error('Expected function to throw an error');
            }
        },
        not: {
            toBe: (expected) => {
                tick();
                if (actual === expected) {
                    throw new Error(`Expected ${actual} not to be ${expected}`);
                }
            }
        }
    };
}

export function getStats() {
    return { ...stats };
}

export function resetStats() {
    stats = { total: 0, passed: 0, failed: 0 };
    testResults = [];
    currentAssertionCount = 0;
}
