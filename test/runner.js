
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlContent = fs.readFileSync(path.join(__dirname, '../app/vault.html'), 'utf8');

global.document = {
    getElementById: (id) => {
        const regex = new RegExp(`<(\\w+)[^>]*id=["']${id}["'][^>]*>`, 'i');
        const match = htmlContent.match(regex);

        if (match) {
            const tag = match[0];
            const element = {
                tagName: match[1],
                style: {},
                dataset: {},
                addEventListener: () => { },
                removeEventListener: () => { },
                classList: {
                    add: () => { },
                    remove: () => { },
                    contains: () => false,
                    toggle: () => { }
                },

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

        const { setSeed, getSeed } = await import('./utils/pbt.js');
        const pbtSeed = process.env.PBT_SEED !== undefined && process.env.PBT_SEED !== ''
            ? (Number(process.env.PBT_SEED) >>> 0)
            : ((Date.now() ^ (process.pid << 16)) >>> 0);
        setSeed(pbtSeed);
        console.log(`[PBT] seed=${getSeed()} (replay with PBT_SEED=${getSeed()} node test/runner.js)\n`);

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
        await import('./codec/decoder/rst-markers.test.js');
        await import('./utils/bit-reader.test.js');
        await import('./automata/bit-streams/bit-core.test.js');
        await import('./utils/marker-parser.test.js');

        await import('./information-theory/steganography/chunk-manager.test.js');
        await import('./codec/steganography/result-contracts.test.js');
        await import('./codec/steganography/format-v2.test.js');
        await import('./information-theory/steganography/f5-syndrome.test.js');
        await import('./codec/steganography/batch-process.test.js');
        await import('./information-theory/error-correction/rs-interleaver.test.js');
        await import('./codec/capacity-scanner.test.js');
        await import('./codec/capacity-scanner.pbt.js');

        await import('./information-theory/cryptography/aes-gcm.test.js');
        await import('./information-theory/cryptography/pbkdf2.test.js');
        await import('./information-theory/cryptography/hmac.test.js');
        await import('./security/carrier-manifest.test.js');
        await import('./security/manifest-enforcement.test.js');
        await import('./security/gf-shamir.test.js');
        await import('./security/css-envelope.test.js');
        await import('./security/threshold-vault.test.js');
        await import('./security/gf256.test.js');
        await import('./fuzz/cli-fuzz.test.js');
        await import('./fuzz/crypto-fuzz.test.js');
        await import('./security/bitreader-differential.test.js');
        await import('./security/ecc-edges.test.js');
        await import('./fuzz/parser-fuzz.test.js');
        await import('./fuzz/codec-mr.test.js');
        await import('./fuzz/vault-batch.test.js');
        await import('./utils/base32.test.js');
        await import('./security/coded-header.test.js');
        await import('./security/totp.test.js');
        await import('./security/extreme-universal.test.js');
        await import('./security/qr-encoder.test.js');
        await import('./security/format-v3.test.js');
        await import('./security/cauchy-ec.test.js');

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

        await import('./codec/encoder/coefficients.test.js');
        await import('./codec/transcoder.test.js');
        await import('./codec/orchestration/orchestrator.test.js');

        await import('./security/secure-id-generation.test.js');
        await import('./security/forged-metadata.test.js');
        await import('./security/chunk-integrity.test.js');
        await import('./security/decoder-hardening.test.js');
        await import('./security/capacity-consistency.test.js');
        await import('./security/vault-hardening.test.js');
        await import('./security/url-safety.test.js');
        await import('./security/probe-regressions.test.js');
        await import('./conformance/wire-format-conformance.test.js');
        await import('./conformance/wire-format.pbt.js');
        await import('./security/ui-legacy-xss.test.js');
        await import('./security/drop-zone-pagination.test.js');
        await import('./utils/atomic-writer.test.js');
        await import('./structures/vault/secure-record.test.js');
        await import('./structures/vault/immutable-vault.test.js');
        await import('./structures/vault/revision-tracking.test.js');
        await import('./structures/vault/encrypted-export.test.js');
        await import('./scripts/cli.test.js');
        await import('./integration/vault/vault-e2e.test.js');
        await import('./integration/vault/vault-e2e-crud.test.js');
        await import('./integration/vault/vault-e2e-carriers.test.js');
        await import('./integration/vault/vault-e2e-crypto-boundary.test.js');
        await import('./integration/vault/vault-e2e-ecc.test.js');
        await import('./integration/vault/vault-e2e-empty.test.js');
        await import('./integration/vault/vault-e2e-multigen.test.js');
        await import('./integration/vault/vault-capacity-ui.test.js');
        await import("./ui-xss.test.js");
        await import("./security/xss.test.js");

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
