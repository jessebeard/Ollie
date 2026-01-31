
import { resetStats, getStats } from './test/utils/test-runner.js';

const testFiles = [
    
    './test/core/encoder/colorspace.test.js',
    
    './test/core/steganography.test.js',
    './test/core/steganography/container.test.js',
    './test/core/steganography/chunk-manager.test.js',
    './test/core/container-format.test.js',
    
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

