/**
 * Opaque encrypted container (Format v4 wrapper).
 *
 * Implements Format v4 zero-length plausible deniability framing
 * powered by Argon2id, HKDF-Expand, and AES-256-GCM.
 */
import { sealOpaque, unsealOpaque } from './opaque-container.js';

export async function sealContainer(password, fields, options = {}) {
    try {
        if (!password || typeof password !== 'string') {
            return [null, new Error('encrypted-container: password required')];
        }

        // Custom serializer supporting Uint8Array in fields
        const serialized = JSON.stringify(fields, (key, value) => {
            if (value instanceof Uint8Array) {
                return { __type: 'Uint8Array', data: Array.from(value) };
            }
            return value;
        });

        const plaintext = new TextEncoder().encode(serialized);
        const [wire, sealErr] = await sealOpaque(plaintext, password, options);
        if (sealErr) return [null, sealErr];

        return [wire, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

export async function unsealContainer(password, wire, options = {}) {
    try {
        if (!password || typeof password !== 'string') {
            return [null, new Error('encrypted-container: password required')];
        }

        const [plaintext, unsealErr] = await unsealOpaque(wire, password, options);
        if (unsealErr || !plaintext) {
            return [null, unsealErr || new Error('unseal failed')];
        }

        const fields = JSON.parse(new TextDecoder().decode(plaintext), (key, value) => {
            if (value && value.__type === 'Uint8Array' && Array.isArray(value.data)) {
                return new Uint8Array(value.data);
            }
            return value;
        });

        return [{ fields }, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}
