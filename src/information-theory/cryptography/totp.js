/**
 * RFC 6238 TOTP implementation.
 * HOTP core per RFC 4226 §5.3, time-based wrapper per RFC 6238 §4.1-5.1,
 * otpauth:// URI parsing per Google Authenticator de facto standard.
 */

/**
 * Generates an HMAC-based one-time password.
 *
 * @param {Uint8Array} key - Shared secret bytes
 * @param {number} counter - HTOP counter value
 * @param {{algorithm?: string, digits?: number}} [options]
 *   algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512' (default 'SHA-1')
 *   digits: 6-10 (default 6)
 * @returns {Promise<[string|null, Error|null]>} OTP code as string
 */
export async function hotp(key, counter, options = {}) {
    const algorithm = options.algorithm || 'SHA-1';
    const digits = options.digits || 6;

    if (!key || !(key instanceof Uint8Array) || key.length === 0) {
        return [null, new Error('totp: key must be a non-empty Uint8Array')];
    }
    if (!Number.isInteger(counter) || counter < 0) {
        return [null, new Error('totp: counter must be a non-negative integer')];
    }
    if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
        return [null, new Error('totp: digits must be an integer in [1,10]')];
    }
    if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) {
        return [null, new Error(`totp: unsupported algorithm ${algorithm}`)];
    }

    if (typeof globalThis === 'undefined' || !globalThis.crypto || !globalThis.crypto.subtle) {
        return [null, new Error('Web Crypto API is not available')];
    }

    try {
        // Build the 8-byte big-endian moving factor
        const counterBytes = new Uint8Array(8);
        let c = counter;
        for (let i = 7; i >= 0; i--) {
            counterBytes[i] = c & 0xFF;
            c = Math.floor(c / 256);
        }

        const hmacKey = await globalThis.crypto.subtle.importKey(
            'raw',
            /** @type {BufferSource} */ (key),
            { name: 'HMAC', hash: algorithm },
            false,
            ['sign']
        );

        const digest = await globalThis.crypto.subtle.sign(
            'HMAC',
            hmacKey,
            /** @type {BufferSource} */ (counterBytes)
        );
        const hash = new Uint8Array(digest);

        // Dynamic truncation (RFC 4226 §5.3)
        const offset = hash[hash.length - 1] & 0x0F;
        const binary =
            ((hash[offset] & 0x7F) << 24) |
            ((hash[offset + 1] & 0xFF) << 16) |
            ((hash[offset + 2] & 0xFF) << 8) |
            (hash[offset + 3] & 0xFF);

        const otp = binary % Math.pow(10, digits);
        return [otp.toString().padStart(digits, '0'), null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Generates a time-based one-time password (RFC 6238).
 *
 * @param {Uint8Array} key
 * @param {{algorithm?: string, digits?: number, period?: number, now?: number}} [options]
 *   period: seconds per step (default 30)
 *   now: Unix timestamp override in seconds (default Date.now()/1000)
 * @returns {Promise<[string|null, Error|null]>}
 */
export async function totp(key, options = {}) {
    const period = options.period || 30;
    if (!Number.isInteger(period) || period < 1) {
        return [null, new Error('totp: period must be a positive integer')];
    }
    const now = options.now !== undefined ? options.now : Date.now() / 1000;
    if (!Number.isFinite(now) || now < 0) {
        return [null, new Error('totp: now must be a non-negative number')];
    }
    const counter = Math.floor(now / period);
    return hotp(key, counter, options);
}

/**
 * Verifies a TOTP code against the expected value within ±window steps.
 *
 * @param {Uint8Array} key
 * @param {string} code - The code to verify
 * @param {{algorithm?: string, digits?: number, period?: number,
 *          window?: number, now?: number}} [options]
 *   window: how many steps before/after current to check (default 1)
 * @returns {Promise<[Object|null, Error|null]>}
 *   On match: { valid: true, matchedOffset: number }
 *   On no match within window: { valid: false, matchedOffset: null }
 */
export async function verifyTotp(key, code, options = {}) {
    if (typeof code !== 'string' || !/^\d+$/.test(code)) {
        return [null, new Error('totp: code must be a numeric string')];
    }
    const window = options.window !== undefined ? options.window : 1;
    const now = options.now !== undefined ? options.now : Date.now() / 1000;
    const period = options.period || 30;

    if (!Number.isInteger(window) || window < 0) {
        return [null, new Error('totp: window must be a non-negative integer')];
    }

    const currentCounter = Math.floor(now / period);

    for (let offset = -window; offset <= window; offset++) {
        const counter = currentCounter + offset;
        if (counter < 0) continue;
        const [expected, err] = await hotp(key, counter, options);
        if (err) return [null, err];
        if (expected === code) {
            return [{ valid: true, matchedOffset: offset }, null];
        }
    }
    return [{ valid: false, matchedOffset: null }, null];
}

/**
 * Parses an otpauth:// URI into structured parameters.
 *
 * @param {string} uri
 * @returns {[Object|null, Error|null]}
 *   { label, issuer?, secret, algorithm?, digits?, period? }
 */
export function parseOtpauthUri(uri) {
    if (typeof uri !== 'string' || !uri.startsWith('otpauth://')) {
        return [null, new Error('otpauth: URI must start with otpauth://')];
    }

    let rest = uri.slice('otpauth://'.length);
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) return [null, new Error('otpauth: missing type/label path')];

    const type = rest.slice(0, slashIdx);
    if (type !== 'totp') {
        return [null, new Error(`otpauth: unsupported type '${type}' (only totp is supported)`)];
    }
    rest = rest.slice(slashIdx + 1);

    const questionIdx = rest.indexOf('?');
    let label;
    let paramsStr;
    if (questionIdx >= 0) {
        label = decodeURIComponent(rest.slice(0, questionIdx));
        paramsStr = rest.slice(questionIdx + 1);
    } else {
        label = decodeURIComponent(rest);
        paramsStr = '';
    }

    const params = {};
    for (const pair of paramsStr.split('&')) {
        if (!pair) continue;
        const eqIdx = pair.indexOf('=');
        if (eqIdx < 0) continue;
        params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
    }

    const secret = params.secret;
    if (!secret) return [null, new Error('otpauth: missing required "secret" parameter')];

    const algorithm = params.algorithm || 'SHA-1';
    if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) {
        return [null, new Error(`otpauth: unsupported algorithm '${algorithm}'`)];
    }

    const digits = params.digits !== undefined ? parseInt(params.digits, 10) : 6;
    if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
        return [null, new Error(`otpauth: invalid digits '${params.digits}'`) ];
    }

    const period = params.period !== undefined ? parseInt(params.period, 10) : 30;
    if (!Number.isInteger(period) || period < 1) {
        return [null, new Error(`otpauth: invalid period '${params.period}'`)];
    }

    const issuer = params.issuer || null;
    const result = { label, issuer, secret, algorithm, digits, period };
    void issuer;
    return [{ ...result, issuer: params.issuer || null }, null];
}

/**
 * Builds an otpauth:// URI from parameters.
 *
 * @param {{label: string, secret: string, issuer?: string,
 *          algorithm?: string, digits?: number, period?: number}} p
 * @returns {[string|null, Error|null]}
 */
export function buildOtpauthUri(p) {
    if (!p || typeof p.label !== 'string' || !p.label) {
        return [null, new Error('otpauth: label is required')];
    }
    if (typeof p.secret !== 'string' || !p.secret) {
        return [null, new Error('otpauth: secret is required')];
    }
    const algorithm = p.algorithm || 'SHA-1';
    const digits = p.digits || 6;
    const period = p.period || 30;
    const parts = [];
    parts.push(`secret=${encodeURIComponent(p.secret)}`);
    if (p.issuer) parts.push(`issuer=${encodeURIComponent(p.issuer)}`);
    if (algorithm !== 'SHA-1') parts.push(`algorithm=${algorithm}`);
    if (digits !== 6) parts.push(`digits=${digits}`);
    if (period !== 30) parts.push(`period=${period}`);
    const labelPart = encodeURIComponent(p.label);
    return [`otpauth://totp/${labelPart}?${parts.join('&')}`, null];
}
