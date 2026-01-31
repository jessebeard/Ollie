import { describe, it, expect, getStats } from './utils/test-runner.js';
import './core/encoder/spiff-generation.test.js';

(async () => {
    console.log('Running SPIFF Generation Tests...');

    const stats = getStats();
    console.log(`\nTest Summary: ${stats.passed} passed, ${stats.failed} failed.`);

    if (stats.failed > 0) {
        process.exit(1);
    }
})();
