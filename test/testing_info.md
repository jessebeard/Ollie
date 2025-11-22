# Test Runner Documentation

This project uses a custom, environment-aware test runner designed to work seamlessly in both **Node.js** (CLI) and **Browser** environments. This ensures that the JPEG codec implementation is robust and compatible across different platforms without relying on heavy external testing frameworks.

## Architecture Overview

The test runner logic is centralized in `test/utils/test-runner.js`. It detects the running environment and adapts its behavior accordingly:

*   **Node.js**: Uses `console.log` for output, tracks statistics (pass/fail counts), and exits with appropriate status codes. It mocks necessary browser APIs (like `document` and `window`) in `test/runner.js` to allow DOM-dependent tests to run in the CLI.
*   **Browser**: Renders a visual report directly into the DOM. It creates a hierarchical structure of test suites and cases, providing immediate visual feedback.

## Key Files

*   `test/utils/test-runner.js`: The core logic implementing `describe`, `it`, and `expect`.
*   `test/runner.js`: The Node.js entry point. It mocks the DOM environment and imports all test files.
*   `test.html`: The Browser entry point. It imports the test files as ES modules.

## API Reference

### Core Functions

#### `describe(name, fn)`
Defines a test suite.
*   **name** (string): The name of the suite.
*   **fn** (function): A function containing the suite's tests (`it` blocks) or nested suites.
*   **Behavior**:
    *   **Node**: Logs the suite name to the console.
    *   **Browser**: Creates a `<div class="suite">` element. Supports nesting by appending to the current parent suite (tracked via `window.__currentSuite`).

#### `it(name, fn)`
Defines a test case.
*   **name** (string): The description of the test case.
*   **fn** (async function): The test logic. Can be asynchronous.
*   **Behavior**:
    *   **Node**: Executes the test, logs a checkmark (✓) or cross (✗), and updates global stats. Catches and logs errors.
    *   **Browser**: Appends a test case element to the current suite. Updates the UI with "Pass" (green) or "Fail" (red) status upon completion.

### Assertions (`expect`)

The `expect(actual)` function returns an object with the following matchers:

*   **`toBe(expected)`**: Strict equality check (`===`).
*   **`toEqual(expected)`**: Deep equality check using `JSON.stringify`.
*   **`toBeCloseTo(expected, precision = 2)`**: Checks if a number is close to the expected value within a given precision. Useful for floating-point math.
*   **`toBeGreaterThan(expected)`**: Checks if `actual > expected`.
*   **`toBeGreaterThanOrEqual(expected)`**: Checks if `actual >= expected`.
*   **`toBeLessThan(expected)`**: Checks if `actual < expected`.
*   **`toBeLessThanOrEqual(expected)`**: Checks if `actual <= expected`.
*   **`toBeDefined()`**: Checks if `actual` is not `undefined`.
*   **`not`**: A modifier to negate the assertion (currently only supports `toBe`).
    *   `expect(actual).not.toBe(expected)`

## Global Variables & Internal State

### Browser Environment
*   **`window.__currentSuite`**: A reference to the DOM element of the currently executing test suite. This is used to handle nested `describe` blocks.
    *   When a `describe` block starts, it sets this variable to its own container.
    *   Nested `describe` blocks or `it` blocks append themselves to `window.__currentSuite`.
    *   When a `describe` block finishes, it restores the previous value, ensuring correct hierarchy.

### Node.js Environment
*   **`stats`**: An internal object tracking `{ total, passed, failed }`.
*   **`global.document` / `global.window`**: Mocked objects in `test/runner.js` to simulate a browser environment for tests that require DOM manipulation (e.g., `document.createElement`).

## Running Tests

### CLI (Node.js)
Run the following command from the project root:
```bash
node test/runner.js
```
This will execute all tests and output the results to the terminal.

### Browser
Open `test.html` in a modern web browser. You can use a local server:
```bash
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000/test.html`.

## Adding New Tests

1.  Create a new test file (e.g., `test/my-feature.test.js`).
2.  Import `describe`, `it`, and `expect` from `../utils/test-runner.js`.
3.  Write your tests.
4.  Add the import to **both**:
    *   `test/runner.js` (for Node)
    *   `test.html` (for Browser)
