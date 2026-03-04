/**
 * Lightweight Coverage Tracker
 *
 * Provides a simple, opt-in module/function-level coverage map.
 * Source modules call `coverage.hit('module', 'function')` at function entry.
 * After the full test suite runs, the tracker reports which modules/functions
 * were exercised and which were not.
 *
 * This is intentionally lightweight (no AST instrumentation) to maintain
 * environment parity between Node.js and browser. It serves as a scaffold
 * for future mutation testing: the coverage map tells a mutation runner
 * which tests to re-run after mutating a specific module.
 *
 * Usage in source modules (opt-in):
 *   import { coverage } from '../test/utils/coverage.js';
 *   // At function entry:
 *   coverage.hit('container-format', 'encode');
 *
 * Usage in test runner:
 *   import { coverage } from './utils/coverage.js';
 *   // After all tests:
 *   coverage.report();
 */

const hitMap = new Map();
const registeredModules = new Map();

export const coverage = {
    /**
     * Registers a module and its expected functions.
     * Call this once per module to declare what functions exist.
     * @param {string} moduleName - The module identifier
     * @param {string[]} functionNames - List of function names in this module
     */
    register(moduleName, functionNames) {
        registeredModules.set(moduleName, new Set(functionNames));
        if (!hitMap.has(moduleName)) {
            hitMap.set(moduleName, new Map());
        }
    },

    /**
     * Records a function hit. Called at function entry in source modules.
     * @param {string} moduleName - The module identifier
     * @param {string} functionName - The function that was called
     */
    hit(moduleName, functionName) {
        if (!hitMap.has(moduleName)) {
            hitMap.set(moduleName, new Map());
        }
        const moduleHits = hitMap.get(moduleName);
        moduleHits.set(functionName, (moduleHits.get(functionName) || 0) + 1);
    },

    /**
     * Returns the raw coverage data.
     * @returns {{ modules: Array<{ name: string, functions: Array<{ name: string, hits: number }>, coverage: number }> }}
     */
    getData() {
        const modules = [];

        for (const [moduleName, expectedFns] of registeredModules) {
            const moduleHits = hitMap.get(moduleName) || new Map();
            const functions = [];
            let covered = 0;

            for (const fnName of expectedFns) {
                const hits = moduleHits.get(fnName) || 0;
                functions.push({ name: fnName, hits });
                if (hits > 0) covered++;
            }

            // Also include any hit functions not in the registry (unregistered hits)
            for (const [fnName, hits] of moduleHits) {
                if (!expectedFns.has(fnName)) {
                    functions.push({ name: fnName, hits });
                    covered++;
                }
            }

            const total = Math.max(functions.length, 1);
            modules.push({
                name: moduleName,
                functions,
                coverage: Math.round((covered / total) * 100)
            });
        }

        // Include modules that were hit but never registered
        for (const [moduleName, moduleHits] of hitMap) {
            if (!registeredModules.has(moduleName)) {
                const functions = [];
                for (const [fnName, hits] of moduleHits) {
                    functions.push({ name: fnName, hits });
                }
                modules.push({
                    name: moduleName,
                    functions,
                    coverage: 100 // All hit functions are covered
                });
            }
        }

        return { modules };
    },

    /**
     * Prints a coverage report to the console.
     * Highlights uncovered functions and shows per-module coverage percentages.
     */
    report() {
        const data = this.getData();
        const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

        if (data.modules.length === 0) {
            console.log('\n[Coverage] No modules registered for coverage tracking.');
            return;
        }

        console.log('\n' + (isNode ? '\x1b[1m' : '') + 'Coverage Report' + (isNode ? '\x1b[0m' : ''));
        console.log('─'.repeat(60));

        let totalCovered = 0;
        let totalFunctions = 0;

        for (const mod of data.modules) {
            const bar = isNode
                ? (mod.coverage >= 100 ? '\x1b[32m' : mod.coverage >= 50 ? '\x1b[33m' : '\x1b[31m')
                : '';
            const reset = isNode ? '\x1b[0m' : '';

            console.log(`${bar}${mod.name}: ${mod.coverage}% (${mod.functions.filter(f => f.hits > 0).length}/${mod.functions.length} functions)${reset}`);

            // Show uncovered functions
            const uncovered = mod.functions.filter(f => f.hits === 0);
            if (uncovered.length > 0) {
                for (const fn of uncovered) {
                    console.log(`  ${isNode ? '\x1b[31m' : ''}✗ ${fn.name} (0 hits)${reset}`);
                }
            }

            totalCovered += mod.functions.filter(f => f.hits > 0).length;
            totalFunctions += mod.functions.length;
        }

        console.log('─'.repeat(60));
        const overallPct = totalFunctions > 0 ? Math.round((totalCovered / totalFunctions) * 100) : 0;
        console.log(`Overall: ${overallPct}% (${totalCovered}/${totalFunctions} functions)`);
    },

    /**
     * Returns which test suites exercised a given module's functions.
     * Useful for mutation testing: given a mutated module, re-run only these tests.
     * @param {string} moduleName - The module to query
     * @returns {string[]} List of function names that were hit
     */
    getHitFunctions(moduleName) {
        const moduleHits = hitMap.get(moduleName);
        if (!moduleHits) return [];
        return Array.from(moduleHits.keys()).filter(fn => moduleHits.get(fn) > 0);
    },

    /**
     * Resets all coverage data.
     */
    reset() {
        hitMap.clear();
        registeredModules.clear();
    }
};
