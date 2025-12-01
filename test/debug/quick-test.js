// Quick test to identify which test files have issues
import { resetStats, getStats } from './test/utils/test-runner.js';

const testFiles = [
    // Basic encoder tests
    './test/core/encoder/colorspace.test.js',
    // Steganography tests (likely affected by encryption)
    './test/core/steganography.test.js',
    './test/core/steganography/container.test.js',
    './test/core/steganography/chunk-manager.test.js',
    './test/core/container-format.test.js',
    // Integration tests (roundtrip tests, affected by encryption)
    './test/integration/steganography-roundtrip.test.js',
];

console.log('Testing files that might be affected by encryption changes...\n');

for (const file of testFiles) {
    resetStats();
    try {
        console.log(`Testing ${file}...`);
        await import(file);
        const stats = getStats();
        if (stats.failed > 0) {
            console.log(`  ❌ ${stats.passed}/${stats.total} passed (${stats.failed} FAILED)\n`);
        } else {
            console.log(`  ✓ All ${stats.passed} tests passed\n`);
        }
    } catch (e) {
        console.log(`  ❌ ERROR - ${e.message}\n`);
    }
}

