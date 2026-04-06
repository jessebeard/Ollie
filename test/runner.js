
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlContent = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');

global.document = {
    getElementById: (id) => {

        const regex = new RegExp(`<(\\w+)[^>]*id=["']${id}["'][^>]*>`, 'i');
        const match = htmlContent.match(regex);

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

                getAttribute: (attr) => {
                    const attrMatch = tag.match(new RegExp(`${attr}=["']([^"']*)["']`));
                    return attrMatch ? attrMatch[1] : null;
                }
            };

            Object.defineProperty(element, 'href', {
                get: () => element.getAttribute('href') || '',
                set: () => { }
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
        return {
            tagName: 'DIV',
            style: {},
            classList: {
                add: () => { },
                remove: () => { },
                contains: () => false,
                toggle: () => { }
            },
            addEventListener: () => { },
            appendChild: () => { },
            getAttribute: () => null,
            setAttribute: () => { },
            removeAttribute: () => { },
            textContent: '',
            innerHTML: '',
            querySelector: function () { return this; },
            querySelectorAll: () => [],
            focus: () => { }
        };
    },
    createElement: (tag) => {
        const element = {
            tagName: tag.toUpperCase(),
            style: {},
            classList: {
                add: () => { },
                remove: () => { },
                contains: () => false,
                toggle: () => { }
            },
            addEventListener: () => { },
            appendChild: () => { },
            getAttribute: () => null,
            setAttribute: () => { },
            removeAttribute: () => { },
            textContent: '',
            innerHTML: '',
            querySelector: function () { return this; },
            querySelectorAll: () => [],
            focus: () => { }
        };
        return element;
    },
    querySelector: () => {
        return {
            addEventListener: () => { },
            style: {},
            classList: { add: () => { }, remove: () => { }, toggle: () => { } },
            textContent: ''
        };
    },
    querySelectorAll: () => [],
    body: {
        appendChild: () => { },
        classList: {
            add: () => { },
            remove: () => { },
            contains: () => false,
            toggle: () => { }
        }
    }
};

global.window = {
    __TEST_RUNNER__: true,
    addEventListener: (event, callback) => {
        if (event === 'DOMContentLoaded') {

            callback();
        }
    }
};

async function runTests() {
    console.log('\x1b[1mRunning Tests...\x1b[0m\n');

    try {

        const { getStats, resetStats, executeTests } = await import('./utils/test-runner.js');

        resetStats();

        await import('./algebraic/colorspace/rgb-to-ycbcr.test.js');
        await import('./algebraic/mappings/blocks.test.js');
        await import('./codec/encoder/headers.test.js');
        await import('./algebraic/discrete-cosine/forward-dct.test.js');
        await import('./algebraic/quantization/forward-quantization.test.js');
        await import('./algebraic/mappings/forward-zigzag.test.js');
        await import('./automata/entropy-coding/huffman-encoder-fsm.test.js');
        await import('./algebraic/mappings/downsampling.test.js');
        await import('./automata/parsers/progressive-encoding.test.js');
        await import('./automata/parsers/spiff-generation.test.js');
        await import('./codec/encoder.test.js');
        await import('./codec/encoder/quality.test.js');
        await import('./codec/encoder/subsampling-420.test.js');

        await import('./automata/parsers/sof-automaton.test.js');
        await import('./automata/parsers/sos-automaton.test.js');
        await import('./automata/parsers/dht-automaton.test.js');
        await import('./automata/parsers/dqt-automaton.test.js');
        await import('./automata/entropy-coding/huffman-decoder-fsm.test.js');
        await import('./algebraic/mappings/inverse-zigzag.test.js');
        await import('./algebraic/quantization/inverse-quantization.test.js');
        await import('./algebraic/discrete-cosine/inverse-dct.test.js');
        await import('./algebraic/discrete-cosine/inverse-dct-spec.test.js');
        await import('./codec/decoder/idct-switching.test.js');
        await import('./algebraic/colorspace/ycbcr-to-rgb.test.js');
        await import('./algebraic/mappings/upsampling.test.js');
        await import('./algebraic/mappings/block-assembly.test.js');
        await import('./automata/parsers/progressive-decoding.test.js');
        await import('./codec/decoder/rst-markers.test.js');
        await import('./utils/bit-reader.test.js');
        await import('./automata/bit-streams/bit-core.test.js');
        await import('./utils/marker-parser.test.js');

        await import('./codec/steganography/steganography.test.js');
        await import('./codec/steganography/container.test.js');
        await import('./information-theory/steganography/chunk-manager.test.js');
        await import('./information-theory/steganography/f5-syndrome.test.js');
        await import('./codec/steganography/batch-process.test.js');
        await import('./information-theory/error-correction/rs-interleaver.test.js');
        await import('./codec/steganography/container-format.test.js');
        await import('./codec/capacity-scanner.test.js');
        await import('./codec/capacity-scanner.pbt.js');

        await import('./information-theory/cryptography/aes-gcm.test.js');
        await import('./information-theory/cryptography/pbkdf2.test.js');

        await import('./integration/error-correction/reed-solomon-integration.test.js');
        await import('./information-theory/error-correction/galois-field.test.js');
        await import('./information-theory/error-correction/reed-solomon-codec.test.js');
        await import('./integration/error-correction/reedsolomon.test.js');

        await import('./codec/decoder.test.js');
        await import('./codec/decoder/defensive.test.js');
        await import('./integration/roundtrip.test.js');
        await import('./integration/steganography-roundtrip.test.js');
        await import('./scripts/auto_detection_roundtrip.test.js');
        await import('./scripts/capacity_validation.test.js');
        await import('./scripts/format_detection.test.js');

        await import('./codec/encoder/coefficients.test.js');
        await import('./codec/transcoder.test.js');
        await import('./codec/orchestration/orchestrator.test.js');

        await import('./security/secure-id-generation.test.js');
        await import('./structures/vault/secure-record.test.js');
        await import('./structures/vault/immutable-vault.test.js');
        await import('./integration/vault/vault-e2e.test.js');
        await import('./integration/vault/vault-e2e-crud.test.js');
        await import('./integration/vault/vault-e2e-carriers.test.js');
        await import('./integration/vault/vault-e2e-crypto-boundary.test.js');
        await import('./integration/vault/vault-e2e-ecc.test.js');
        await import('./integration/vault/vault-e2e-empty.test.js');
        await import('./integration/vault/vault-e2e-multigen.test.js');
        await import('./integration/vault/vault-capacity-ui.test.js');

        await executeTests();
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
