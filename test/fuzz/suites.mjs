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

export const FUZZ_SUITES = {
    cli: { description: 'CLI argument parsing + typed error tuples', run: runCliFuzz },
    crypto: { description: 'SHA-256 KATs, AES-GCM structure, PBKDF2 bounds, HMAC', run: runCryptoFuzz }
};

export function getSuiteNames() {
    return Object.keys(FUZZ_SUITES);
}
