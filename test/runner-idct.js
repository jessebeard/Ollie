
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Minimal DOM Mocks (Copied from runner.js) ---
const htmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

global.document = {
    getElementById: (id) => { return { style: {}, getAttribute: () => null }; }, // Simplified
    createElement: (tag) => { return { style: {}, appendChild: () => { }, textContent: '' }; },
    body: { appendChild: () => { } }
};
global.window = { addEventListener: (e, cb) => { if (e === 'DOMContentLoaded') cb(); } };

async function runTests() {
    console.log('\x1b[1mRunning IDCT Tests...\x1b[0m\n');
    try {
        const { getStats, resetStats } = await import('./utils/test-runner.js');
        resetStats();

        await import('./core/decoder/idct.test.js');

        const stats = getStats();
        console.log(`\n\x1b[1mTest Summary:\x1b[0m`);
        console.log(`  Total:  ${stats.total}`);
        console.log(`  \x1b[32mPassed: ${stats.passed}\x1b[0m`);
        console.log(`  \x1b[31mFailed: ${stats.failed}\x1b[0m`);

        if (stats.failed > 0) process.exit(1);
        else process.exit(0);

    } catch (error) {
        console.error('\x1b[31mError running tests:\x1b[0m', error);
        process.exit(1);
    }
}

runTests();
