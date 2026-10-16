import { describe, it, expect } from '../../utils/test-runner.js';
import { importHmacKey, signBytes, verifyBytes } from '../../../src/information-theory/cryptography/hmac.js';

function bytes(str) {
    return new TextEncoder().encode(str);
}

describe('HMAC-SHA256 primitive', () => {

    it('signs and verifies a message roundtrip', async () => {
        const [key, keyErr] = await importHmacKey(bytes('carrier-manifest-key'));
        expect(keyErr).toBe(null);

        const [mac, signErr] = await signBytes(key, bytes('manifest payload v1'));
        expect(signErr).toBe(null);
        expect(mac).toBeInstanceOf(Uint8Array);
        expect(mac).toHaveLength(32);

        const [ok, verifyErr] = await verifyBytes(key, bytes('manifest payload v1'), mac);
        expect(verifyErr).toBe(null);
        expect(ok).toBe(true);
    });

    it('rejects a tampered message', async () => {
        const [key] = await importHmacKey(bytes('k'));
        const [mac] = await signBytes(key, bytes('chunks:[1,2,3],rev:7'));

        const tampered = bytes('chunks:[1,2,4],rev:7');
        const [ok] = await verifyBytes(key, tampered, mac);
        expect(ok).toBe(false);
    });

    it('rejects a mac produced under a different key', async () => {
        const [keyA] = await importHmacKey(bytes('password-a'));
        const [keyB] = await importHmacKey(bytes('password-b'));

        const [mac] = await signBytes(keyA, bytes('shared message'));
        const [ok] = await verifyBytes(keyB, bytes('shared message'), mac);
        expect(ok).toBe(false);
    });

    it('is deterministic for identical key and message', async () => {
        const [key] = await importHmacKey(bytes('fixed-test-key'));
        const data = bytes('canonical serialization');

        const [mac1] = await signBytes(key, data);
        const [mac2] = await signBytes(key, data);

        expect(Array.from(mac1)).toEqual(Array.from(mac2));
    });

    it('rejects empty and non-byte key material via tuple', async () => {
        const [, errEmpty] = await importHmacKey(new Uint8Array(0));
        expect(errEmpty).toBeInstanceOf(Error);

        const [, errType] = await importHmacKey('not-bytes');
        expect(errType).toBeInstanceOf(Error);
    });

    it('verify returns false (not error) for malformed mac lengths', async () => {
        const [key] = await importHmacKey(bytes('k'));
        const [ok] = await verifyBytes(key, bytes('data'), new Uint8Array(3));
        expect(ok).toBe(false);
    });
});
