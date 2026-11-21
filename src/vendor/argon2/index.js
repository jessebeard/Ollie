// @ts-nocheck
import setupWasm from './setup.js';
import { SIMD_WASM_B64, NO_SIMD_WASM_B64 } from './wasm-binaries.js';

function b64ToUint8(b64) {
    if (typeof atob === 'function') {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

const getSIMD = (importObject) => WebAssembly.instantiate(b64ToUint8(SIMD_WASM_B64), importObject);
const getNonSIMD = (importObject) => WebAssembly.instantiate(b64ToUint8(NO_SIMD_WASM_B64), importObject);

let loaderPromise = null;

/**
 * Loads the WebAssembly Argon2id module with SIMD or non-SIMD fallback.
 * @returns {Promise<Function>} Low-level argon2id computeHash function
 */
export async function loadArgon2id() {
    if (!loaderPromise) {
        loaderPromise = setupWasm(getSIMD, getNonSIMD);
    }
    return loaderPromise;
}

/**
 * High-level Argon2id key derivation helper with Format v4 defaults.
 *
 * @param {Object} options
 * @param {string|Uint8Array} options.password - Master password
 * @param {Uint8Array} options.salt - Salt bytes (min 8 bytes, typically 16 bytes)
 * @param {number} [options.passes=3] - Number of passes (t)
 * @param {number} [options.memorySize=65536] - Memory in KiB (m=64MB)
 * @param {number} [options.parallelism=1] - Parallelism lanes (p=1)
 * @param {number} [options.tagLength=32] - Output key length in bytes
 * @returns {Promise<Uint8Array>} Derived Argon2id key tag
 */
export async function deriveArgon2id(options = {}) {
    const rawHasher = await loadArgon2id();
    const password = typeof options.password === 'string'
        ? new TextEncoder().encode(options.password)
        : (options.password instanceof Uint8Array ? options.password : new Uint8Array(0));

    const salt = options.salt instanceof Uint8Array
        ? options.salt
        : (typeof options.salt === 'string' ? new TextEncoder().encode(options.salt) : new Uint8Array(0));

    const passes = Number.isInteger(options.passes) ? options.passes : 3;
    const memorySize = Number.isInteger(options.memorySize) ? options.memorySize : 65536;
    const parallelism = Number.isInteger(options.parallelism) ? options.parallelism : 1;
    const tagLength = Number.isInteger(options.tagLength) ? options.tagLength : 32;

    return rawHasher({
        password,
        salt,
        passes,
        memorySize,
        parallelism,
        tagLength,
        ad: options.ad,
        secret: options.secret
    });
}

export default deriveArgon2id;
