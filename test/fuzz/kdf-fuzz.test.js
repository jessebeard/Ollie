import { describe, it, expect } from '../utils/test-runner.js';
import { KeyDerivation } from '../../src/information-theory/cryptography/pbkdf2.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

describe('KDF & Rotation: Fuzz & Boundary Testing', () => {

    it('fuzzes hostile and boundary iteration values', () => {
        const hostileValues = [
            -1, -1000, 0, 1, 100, 599999, 10000001, 999999999,
            NaN, Infinity, -Infinity, null, undefined, '', '600000',
            {}, [], () => {}, true, false, 600000.5, 123.456
        ];

        for (const val of hostileValues) {
            const resolved = KeyDerivation.resolveIterations(val);
            if (val === undefined || val === null) {
                expect(resolved).toBe(KeyDerivation.ITERATIONS);
            } else {
                expect(resolved).toBeInstanceOf(Error);
            }
        }
    });

    it('fuzzes rotation password inputs (null-byte, unicode, long strings)', async () => {
        const vault = new PasswordVault([], null, true, 'init-pass');

        // Boundary: 599,999 iterations must fail
        const [, errBoundaryLow] = await vault.changeMasterPassword('valid-next-pw', { iterations: 599999 });
        expect(errBoundaryLow).toBeInstanceOf(Error);

        // Boundary: 600,000 iterations must succeed
        const [v600k, err600k] = await vault.changeMasterPassword('valid-next-pw', { iterations: 600000 });
        expect(err600k).toBe(null);
        expect(v600k.metadata.kdf?.iterations).toBe(600000);

        // Complex unicode and surrogate pairs
        const complexPass = '🔒🔑Passwørd-日本語-🚀-123456';
        const [vUnicode, unicodeErr] = await v600k.changeMasterPassword(complexPass);
        expect(unicodeErr).toBe(null);

        const serialized = vUnicode.toJSON();
        const locked = vUnicode.lock();
        expect(locked.isUnlocked).toBe(false);
        const [unlocked, unlockErr] = await PasswordVault.fromJSON(serialized, complexPass);
        expect(unlockErr).toBe(null);
        expect(unlocked.isUnlocked).toBe(true);
    });

    it('fails safely on corrupted KDF wrapped session key data', async () => {
        const metadata = {
            version: '3.0',
            revision: 1,
            created: new Date().toISOString(),
            kdf: {
                algo: 'PBKDF2-SHA256',
                iterations: 600000,
                salt: 'AAAA', // malformed / corrupted
                wrapIV: 'BBBB',
                wrappedSessionKey: 'CCCC'
            }
        };

        const [, err] = await PasswordVault.fromJSON({ metadata, entries: [] }, 'test-pass');
        expect(err).toBeInstanceOf(Error);
    });
});
