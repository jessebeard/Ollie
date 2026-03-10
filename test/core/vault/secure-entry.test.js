import { describe, it, expect } from '../../utils/test-runner.js';
import { SecureEntry } from '../../../src/core/vault/secure-entry.js';
import { KeyDerivation } from '../../../src/core/crypto/key-derivation.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('SecureEntry (Hardened Primitive PBT)', () => {

    async function getTestKey(password, saltBytes) {
        const [key, kErr] = await KeyDerivation.deriveKey(password, saltBytes);
        if (kErr) throw kErr;
        return key;
    }

    const arbEntry = () => ({
        id: Arbitrary.string(10, 20).generate(),
        title: Arbitrary.string(1, 50).generate(),
        url: Arbitrary.string(5, 100).generate(),
        username: Arbitrary.string(1, 30).generate(),
        password: Arbitrary.string(8, 64).generate(),
        notes: Arbitrary.string(0, 500).generate(),
        tags: Arbitrary.array(Arbitrary.string(1, 10), 0, 5).generate(),
        totp: Arbitrary.string(16, 16).generate(),
        customFields: Arbitrary.array({
            generate: () => ({
                label: Arbitrary.string(1, 20).generate(),
                value: Arbitrary.string(1, 50).generate()
            }),
            shrink: () => []
        }, 0, 3).generate(),
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    });

    it('Property: Secure Identity Roundtrip (create then decrypt matches exactly)', async () => {
        await assertProperty(
            [
                { generate: arbEntry, shrink: () => [] },
                Arbitrary.string(8, 32),
                Arbitrary.byteArray(16, 16)
            ],
            async (plaintextEntry, masterPass, salt) => {
                const key = await getTestKey(masterPass, salt);

                const [secureEntry, err] = await SecureEntry.create(plaintextEntry, key);
                expect(err).toEqual(null);

                const [decrypted, decErr] = await secureEntry.decrypt(key);
                expect(decErr).toEqual(null);

                // Assert strict structural equivalence of original and decrypted
                expect(decrypted.id).toBe(plaintextEntry.id);
                expect(decrypted.title).toBe(plaintextEntry.title);
                expect(decrypted.url).toBe(plaintextEntry.url);
                expect(decrypted.username).toBe(plaintextEntry.username);
                expect(decrypted.password).toBe(plaintextEntry.password);
                expect(decrypted.notes).toBe(plaintextEntry.notes);
                expect(decrypted.totp).toBe(plaintextEntry.totp);

                if (plaintextEntry.tags) {
                    expect(decrypted.tags.length).toBe(plaintextEntry.tags.length);
                }
                if (plaintextEntry.customFields) {
                    expect(decrypted.customFields.length).toBe(plaintextEntry.customFields.length);
                }

                return true;
            },
            50
        );
    });

    it('Property: Structural Immutability & Plaintext Absence', async () => {
        await assertProperty(
            [
                { generate: arbEntry, shrink: () => [] },
                Arbitrary.string(8, 32),
                Arbitrary.byteArray(16, 16)
            ],
            async (plaintextEntry, masterPass, salt) => {
                const key = await getTestKey(masterPass, salt);

                const [secureEntry, err] = await SecureEntry.create(plaintextEntry, key);
                expect(err).toEqual(null);

                // Assert public fields remain plaintext
                expect(secureEntry.title).toBe(plaintextEntry.title);
                expect(secureEntry.url).toBe(plaintextEntry.url);
                expect(secureEntry.username).toBe(plaintextEntry.username);

                // Assert sensitive fields are ABSENT from top-level and exist only as ciphertexts
                expect(secureEntry.password).toBe(undefined);
                expect(secureEntry.notes).toBe(undefined);
                expect(secureEntry.totp).toBe(undefined);
                expect(secureEntry.customFields).toBe(undefined);

                // Assert the internal ciphertexts do not leak the plaintext
                if (plaintextEntry.password && plaintextEntry.password.length > 0) {
                    const isMissingPlaintext = !JSON.stringify(secureEntry._encrypted).includes(plaintextEntry.password);
                    expect(isMissingPlaintext).toBe(true);
                }

                // Assert Immutability (Object.isFrozen should be true)
                expect(Object.isFrozen(secureEntry)).toBe(true);
                expect(Object.isFrozen(secureEntry.tags)).toBe(true);
                expect(Object.isFrozen(secureEntry._encrypted)).toBe(true);

                return true;
            },
            25
        );
    });

    it('Property: Strict Key Rejection', async () => {
        await assertProperty(
            [
                { generate: arbEntry, shrink: () => [] },
                Arbitrary.string(10, 20),
                Arbitrary.string(10, 20),
                Arbitrary.byteArray(16, 16)
            ],
            async (plaintextEntry, pass1, pass2, salt) => {
                if (pass1 === pass2) return true;

                const key1 = await getTestKey(pass1, salt);
                const key2 = await getTestKey(pass2, salt);

                const [secureEntry, err] = await SecureEntry.create(plaintextEntry, key1);
                expect(err).toEqual(null);

                const [decrypted, decErr] = await secureEntry.decrypt(key2);
                expect(decrypted).toEqual(null);
                expect(decErr !== null).toBe(true); // Must explicitly return an error tuple

                return true;
            },
            20
        );
    });

});
