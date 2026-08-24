/**
 * Opaque encrypted container.
 *
 * The ENTIRE container content — identity fields, metadata, payload — is
 * serialized to JSON, encrypted under AES-256-GCM using a key derived from
 * the master password via PBKDF2-HMAC-SHA-256, and stored alongside a
 * per-save CSPRNG salt. Without the password, every byte after the 28-byte
 * salt+nonce prefix is computationally indistinguishable from random noise.
 *
 * Wire format:
 *     salt(16) ‖ nonce(12) ‖ AES-256-GCM ciphertext(includes tag)
 */
import { KeyDerivation } from '../cryptography/pbkdf2.js';
import { Encryption } from '../cryptography/aes-gcm.js';

/**
 * Encrypts a fields object into an opaque wire-format envelope.
 *
 * @param {string} password - Master password
 * @param {Object} fields - All container data (identity, metadata, payload)
 * @returns {Promise<[Uint8Array|null, Error|null]>} Wire format tuple
 */
export async function sealContainer(password, fields) {
    try {
        if (!password || typeof password !== 'string') {
            return [null, new Error('encrypted-container: password required')];
        }

        // Generate fresh CSPRNG salt
        const salt = new Uint8Array(16);
        crypto.getRandomValues(salt);

        // Serialize fields to bytes
        const plaintext = new TextEncoder().encode(JSON.stringify(fields));

        // Derive key from password + salt
        const [key, keyErr] = await KeyDerivation.deriveKey(
            password, salt, { iterations: KeyDerivation.ITERATIONS }
        );
        if (keyErr) return [null, keyErr];

        // AES-GCM encrypt (generates its own random IV internally)
        const [encResult, encErr] = await Encryption.encrypt(plaintext, key);
        if (encErr) return [null, encErr];

        // Wire format: salt(16) ‖ iv(12) ‖ ciphertext_with_tag
        const iv = new Uint8Array(encResult.iv);
        const ct = new Uint8Array(encResult.ciphertext);
        const wire = new Uint8Array(salt.length + iv.length + ct.length);
        wire.set(salt, 0);
        wire.set(iv, salt.length);
        wire.set(ct, salt.length + iv.length);

        return [wire, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}

/**
 * Decrypts an opaque container wire format back into its original fields.
 * Wrong password or tampered data yields null via GCM auth failure.
 *
 * @param {string} password
 * @param {Uint8Array} wire
 * @returns {Promise<[Object|null, Error|null]>} Decrypted fields tuple
 */
export async function unsealContainer(password, wire) {
    try {
        if (!password || typeof password !== 'string') {
            return [null, new Error('encrypted-container: password required')];
        }
        if (!wire || !(wire instanceof Uint8Array) || wire.length < 16 + 12 + 16) {
            return [null, new Error('encrypted-container: wire too short')];
        }

        const salt = wire.slice(0, 16);
        const iv = wire.slice(16, 28);
        const ciphertext = wire.slice(28);

        const [key, keyErr] = await KeyDerivation.deriveKey(
            password, salt, { iterations: KeyDerivation.ITERATIONS }
        );
        if (keyErr) return [null, keyErr];

        const [pt, decErr] = await Encryption.decrypt(ciphertext, key, iv);
        if (decErr) return [null, decErr];

        const fields = JSON.parse(new TextDecoder().decode(pt));
        return [{ fields }, null];
    } catch (e) {
        return [null, e instanceof Error ? e : new Error(String(e))];
    }
}
