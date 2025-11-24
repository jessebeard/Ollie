import { describe, it, expect, getStats } from './utils/test-runner.js';
import './core/encoder/spiff-generation.test.js';

// Simple runner logic since we don't have the full test runner loaded
(async () => {
    console.log('Running SPIFF Generation Tests...');
    // The tests register themselves via describe/it
    // We need a mechanism to trigger them if the framework requires it, 
    // but looking at test-runner.js structure (inferred), it might just run immediately or need a trigger.
    // Let's assume we need to print stats at the end.

    // Wait for tests to finish (if async) - though our tests seem synchronous.

    const stats = getStats();
    console.log(`\nTest Summary: ${stats.passed} passed, ${stats.failed} failed.`);

    if (stats.failed > 0) {
        process.exit(1);
    }
})();
