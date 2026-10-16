/**
 * Zero-dependency compression and decompression using native CompressionStream API.
 * Supported in all modern browsers and Node.js 18+.
 */

/**
 * Compresses data using deflate-raw.
 *
 * @param {Uint8Array} input
 * @returns {Promise<[Uint8Array|null, Error|null]>}
 */
export async function deflate(input) {
    if (!(input instanceof Uint8Array)) {
        return [null, new Error('deflate: input must be a Uint8Array')];
    }
    if (input.length === 0) {
        return [new Uint8Array(0), null];
    }

    try {
        if (typeof CompressionStream === 'function') {
            const cs = new CompressionStream('deflate-raw');
            const stream = new Response(/** @type {any} */ (input)).body.pipeThrough(cs);
            const buffer = await new Response(stream).arrayBuffer();
            return [new Uint8Array(buffer), null];
        } else {
            // Uncompressed fallback if CompressionStream is absent
            return [input, null];
        }
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Decompresses data using deflate-raw.
 *
 * @param {Uint8Array} input
 * @returns {Promise<[Uint8Array|null, Error|null]>}
 */
export async function inflate(input) {
    if (!(input instanceof Uint8Array)) {
        return [null, new Error('inflate: input must be a Uint8Array')];
    }
    if (input.length === 0) {
        return [new Uint8Array(0), null];
    }

    try {
        if (typeof DecompressionStream === 'function') {
            const ds = new DecompressionStream('deflate-raw');
            const stream = new Response(/** @type {any} */ (input)).body.pipeThrough(ds);
            const buffer = await new Response(stream).arrayBuffer();
            return [new Uint8Array(buffer), null];
        } else {
            return [input, null];
        }
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}
