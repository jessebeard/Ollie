/**
 * ESLint flat config (ESLint 9). Dev-only tooling — documented exception to
 * the zero-dependency constitution rule (#1), mandated by audit item I8.
 *
 * Layers:
 *   src/     — library code: strict (no console, no unused vars)
 *   app/     — browser UI: browser globals, console allowed until the
 *              leveled-logger adoption lands
 *   scripts/ — Node tooling: node globals
 *   test/    — relaxed (console is a legitimate assertion channel there)
 */

const sharedRules = {
    'no-var': 'error',
    'prefer-const': 'error',
    eqeqeq: ['error', 'smart'],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }]
};

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    location: 'readonly',
    navigator: 'readonly',
    localStorage: 'readonly',
    FileReader: 'readonly',
    Blob: 'readonly',
    File: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    crypto: 'readonly',
    btoa: 'readonly',
    atob: 'readonly',
    requestAnimationFrame: 'readonly',
    getComputedStyle: 'readonly',
    Event: 'readonly',
    CustomEvent: 'readonly'
};

const nodeGlobals = {
    process: 'readonly',
    Buffer: 'readonly',
    console: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly'
};

export default [
    {
        ignores: ['node_modules/', 'test/fixtures/', '**/*.min.js', 'docs/']
    },

    // --- Library code: strictest tier ---
    // src is intentionally dual-environment (constitution rule #4): crypto
    // paths touch WebCrypto in browsers and Node; UI bootstrap touches DOM.
    // Union of both global sets is therefore expected here.
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...browserGlobals,
                ...nodeGlobals,
                Image: 'readonly',
                ImageData: 'readonly',
                ImageBitmap: 'readonly'
            }
        },
        rules: {
            ...sharedRules,
            'no-console': 'error',
            'no-undef': 'error'
        }
    },

    // The leveled logger is the single sanctioned console sink.
    {
        files: ['src/utils/logger.js'],
        rules: {
            'no-console': 'off'
        }
    },

    // --- Browser UI ---
    {
        files: ['app/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: browserGlobals
        },
        rules: sharedRules
    },

    // --- Node tooling ---
    {
        files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: nodeGlobals
        },
        rules: sharedRules
    },

    // --- Tests: relaxed, console allowed ---
    {
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...nodeGlobals, ...browserGlobals }
        },
        rules: {
            ...sharedRules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }]
        }
    }
];
