/**
 * Central registry for the long-run fuzz driver (scripts/fuzz.mjs).
 *
 * Each suite is a function (scale) => void where `scale` multiplies
 * iteration counts: CI runs scale 1 as a smoke pass, local runs use larger
 * scales with fresh seeds. Suites must print nothing on success and throw
 * (with a shrunk counterexample) on failure.
 */
import { runCliFuzz } from './cli-fuzz.mjs';
import { runCryptoFuzz } from './crypto-fuzz.mjs';
import { runBitstreamsFuzz } from './bitstreams-fuzz.mjs';
import { runEccEdgeFuzz } from './ecc-fuzz.mjs';
import { runParserFuzz } from './parser-fuzz.mjs';
import { runCodecMrfuzz } from './codec-mr.mjs';
import { runVaultModelFuzz, runZeroizationChecks, runBatchSubsetFuzz } from './vault-batch-fuzz.mjs';
import { runStegoFuzz } from './stego-fuzz.mjs';
import { runSteganographyMrFuzz } from './steganography-mr.mjs';
import { runCsvFuzz } from './csv-fuzz.mjs';
import { runUtilsFuzz } from './utils-fuzz.mjs';
import { runQrFuzz } from './qr-fuzz.mjs';
import { runJuniwardMrFuzz } from './juniward-mr.mjs';

export const FUZZ_SUITES = {
    cli: { description: 'CLI argument parsing + typed error tuples', run: runCliFuzz, tags: ['cli', 'smoke', 'parser'], defaultScale: 'light' },
    crypto: { description: 'SHA-256 KATs, AES-GCM structure, PBKDF2 bounds, HMAC', run: runCryptoFuzz, tags: ['crypto', 'kat', 'security', 'smoke'], defaultScale: 'light' },
    bitstreams: { description: 'BitReader differential across read strategies and stuffed streams', run: runBitstreamsFuzz, tags: ['bitstream', 'differential', 'pbt'], defaultScale: 'medium' },
    ecc: { description: 'RS tolerance-edge corruption distribution properties', run: runEccEdgeFuzz, tags: ['ecc', 'rs', 'boundary'], defaultScale: 'medium' },
    parsers: { description: 'Mutated-JPEG parser fuzz with hang/bomb isolation (Node workers)', run: runParserFuzz, tags: ['parser', 'worker', 'mutation'], defaultScale: 'heavy' },
    codec: { description: 'Codec metamorphic MRs: dimensions, determinism, monotonicity, fidelity, stego survival', run: runCodecMrfuzz, tags: ['codec', 'mt', 'mr'], defaultScale: 'medium' },
    vault: { description: 'Model-based op-sequence fuzzing against vault invariants', run: runVaultModelFuzz, tags: ['vault', 'model', 'security'], defaultScale: 'medium' },
    zeroize: { description: 'DEK zeroization + lock hygiene checks', run: runZeroizationChecks, tags: ['vault', 'zeroize', 'security', 'smoke'], defaultScale: 'light' },
    batch: { description: 'EC carrier-subset recovery MRs over randomized (k,n) grids', run: runBatchSubsetFuzz, tags: ['ecc', 'cauchy', 'mt', 'mr'], defaultScale: 'medium' },
    stego: { description: 'STC trellis roundtrip and opaque container framing fuzz', run: runStegoFuzz, tags: ['stego', 'roundtrip', 'stc'], defaultScale: 'medium' },
    'stego-mr': { description: 'Steganography metamorphic relations (determinism, monotonicity, key isolation)', run: runSteganographyMrFuzz, tags: ['stego', 'mt', 'mr'], defaultScale: 'medium' },
    csv: { description: 'Hostile CSV text parsing and vendor mapping fuzz', run: runCsvFuzz, tags: ['csv', 'parser', 'security'], defaultScale: 'medium' },
    utils: { description: 'Base32, Base64, UTF-8, URL safety, escape-html, and CRC32 fuzz', run: runUtilsFuzz, tags: ['utils', 'roundtrip', 'encoding', 'smoke'], defaultScale: 'light' },
    qr: { description: 'QR encode/decode roundtrip, binarizer robustness, and format fuzz', run: runQrFuzz, tags: ['qr', 'roundtrip', 'codec'], defaultScale: 'medium' },
    juniward: { description: 'J-UNIWARD spatial wavelet sensitivity, cost monotonicity, and anti-SCA bounds', run: runJuniwardMrFuzz, tags: ['juniward', 'stego', 'mt', 'mr', 'smoke'], defaultScale: 'medium' }
};

export function getSuiteNames() {
    return Object.keys(FUZZ_SUITES);
}

export function getSuitesByTag(tag) {
    return Object.entries(FUZZ_SUITES)
        .filter(([, s]) => s.tags && s.tags.includes(tag))
        .map(([name]) => name);
}

export function getAllTags() {
    const tags = new Set();
    for (const suite of Object.values(FUZZ_SUITES)) {
        if (suite.tags) {
            suite.tags.forEach(t => tags.add(t));
        }
    }
    return Array.from(tags).sort();
}
