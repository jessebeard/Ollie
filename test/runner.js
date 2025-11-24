
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Minimal DOM Mocks ---
const htmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

global.document = {
    getElementById: (id) => {
        // Simple regex to find element by ID and extract attributes
        // Matches: <tag ... id="value" ... > or <tag ... id='value' ... >
        const regex = new RegExp(`<(\\w+)[^>]*id=["']${id}["'][^>]*>`, 'i');
        const match = htmlContent.match(regex);
        // console.log(`Searching for ID: ${id}`, match ? 'Found' : 'Not Found');
        if (!match && id === 'progressive-checkbox') {
            const idx = htmlContent.indexOf(id);
            if (idx !== -1) {
                console.log('Context around ID:', htmlContent.substring(idx - 50, idx + 50));
            } else {
                console.log('ID string not found in HTML content!');
            }
            console.log('Regex used:', regex);
        }

        if (match) {
            const tag = match[0];
            const element = {
                tagName: match[1],
                style: {},
                // Extract style display:none if present
                get style() {
                    const styleMatch = tag.match(/style=["']([^"']*)["']/);
                    const styleObj = {};
                    if (styleMatch) {
                        const styles = styleMatch[1].split(';');
                        styles.forEach(s => {
                            const [key, val] = s.split(':');
                            if (key && val) styleObj[key.trim()] = val.trim();
                        });
                    }
                    return styleObj;
                },
                // Extract other attributes like href, download
                getAttribute: (attr) => {
                    const attrMatch = tag.match(new RegExp(`${attr}=["']([^"']*)["']`));
                    return attrMatch ? attrMatch[1] : null;
                }
            };

            // Map common properties
            Object.defineProperty(element, 'href', {
                get: () => element.getAttribute('href') || '',
                set: () => { } // No-op for set in this simple parser
            });
            Object.defineProperty(element, 'download', {
                get: () => element.getAttribute('download') || '',
                set: () => { }
            });
            Object.defineProperty(element, 'type', {
                get: () => element.getAttribute('type') || '',
                set: () => { }
            });
            Object.defineProperty(element, 'checked', {
                get: () => element.getAttribute('checked') !== null,
                set: () => { }
            });

            return element;
        }
        return null;
    },
    createElement: (tag) => {
        return {
            style: {},
            appendChild: () => { },
            textContent: ''
        };
    },
    body: {
        appendChild: () => { }
    }
};

global.window = {
    addEventListener: (event, callback) => {
        if (event === 'DOMContentLoaded') {
            // Execute immediately for our test runner
            callback();
        }
    }
};

// Mock console.log/error to capture test output if needed, 
// but for now we'll just let them print to stdout.

// --- Test Runner Logic ---

async function runTests() {
    console.log('\x1b[1mRunning Tests...\x1b[0m\n');

    try {
        // Import the test runner to get stats
        const { getStats, resetStats } = await import('./utils/test-runner.js');

        resetStats();

        // Import all test files
        await import('./core/encoder/colorspace.test.js');
        await import('./core/encoder/blocks.test.js');
        await import('./core/encoder/headers.test.js');
        await import('./core/encoder/dct.test.js');
        await import('./core/encoder/quantization.test.js');
        await import('./core/encoder/zigzag.test.js');
        await import('./core/encoder/huffman.test.js');
        await import('./core/jpeg-encoder.test.js');

        // Decoder Tests
        await import('./core/decoder/frame-parser.test.js');
        await import('./core/decoder/scan-parser.test.js');
        await import('./core/decoder/huffman-parser.test.js');
        await import('./core/decoder/quantization-parser.test.js');
        await import('./core/decoder/huffman-decoder.test.js');
        await import('./core/decoder/inverse-zigzag.test.js');
        await import('./core/decoder/dequantization.test.js');
        await import('./core/decoder/idct.test.js');
        await import('./core/decoder/idct-switching.test.js');
        await import('./core/decoder/colorspace-decoder.test.js');
        await import('./core/decoder/upsampling.test.js');
        await import('./core/decoder/block-assembly.test.js');

        // Integration Tests
        await import('./core/jpeg-decoder.test.js');
        await import('./integration/roundtrip.test.js');

        await import('./ui.test.js');

        const stats = getStats();

        console.log(`\n\x1b[1mTest Summary:\x1b[0m`);
        console.log(`  Total:  ${stats.total}`);
        console.log(`  \x1b[32mPassed: ${stats.passed}\x1b[0m`);
        console.log(`  \x1b[31mFailed: ${stats.failed}\x1b[0m`);

        if (stats.failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (error) {
        console.error('\x1b[31mError running tests:\x1b[0m', error);
        process.exit(1);
    }
}

runTests();
