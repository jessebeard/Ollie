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

export const FUZZ_SUITES = {
    cli: { description: 'CLI argument parsing + typed error tuples', run: runCliFuzz },
    crypto: { description: 'SHA-256 KATs, AES-GCM structure, PBKDF2 bounds, HMAC', run: runCryptoFuzz },
    bitstreams: { description: 'BitReader differential across read strategies and stuffed streams', run: runBitstreamsFuzz },
    ecc: { description: 'RS tolerance-edge corruption distribution properties', run: runEccEdgeFuzz }
};

export function getSuiteNames() {
    return Object.keys(FUZZ_SUITES);
}
