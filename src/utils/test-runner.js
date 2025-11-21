
export function describe(name, fn) {
    const runSuite = () => {
        const container = document.createElement('div');
        container.className = 'suite';
        container.innerHTML = `<h3>${name}</h3>`;

        const resultsDiv = document.getElementById('test-results');
        if (resultsDiv) {
            resultsDiv.appendChild(container);
        } else {
            document.body.appendChild(container);
        }

        // We'll use a global context to attach results to this container
        window.__currentSuite = container;

        try {
            fn();
        } catch (e) {
            console.error(e);
            container.innerHTML += `<div class="error">Suite Error: ${e.message}</div>`;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSuite);
    } else {
        runSuite();
    }
}

export function it(name, fn) {
    const suite = window.__currentSuite || document.body;
    const resultDiv = document.createElement('div');
    resultDiv.className = 'test-case';

    try {
        fn();
        resultDiv.classList.add('pass');
        resultDiv.textContent = `✓ ${name}`;
        console.log(`PASS: ${name}`);
    } catch (e) {
        resultDiv.classList.add('fail');
        resultDiv.textContent = `✗ ${name}: ${e.message}`;
        console.error(`FAIL: ${name}`, e);
    }

    suite.appendChild(resultDiv);
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
        }
    };
}
