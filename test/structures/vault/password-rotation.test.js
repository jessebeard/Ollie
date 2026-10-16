import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { KeyDerivation } from '../../../src/information-theory/cryptography/pbkdf2.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('PasswordVault: Master Password & Salt Rotation', () => {

    it('successfully changes master password and preserves all entry contents', async () => {
        const initialPassword = 'old-master-password-123';
        const newPassword = 'new-master-password-456';

        const vault = new PasswordVault([], null, true, initialPassword);
        const [v1, err1] = await vault.addEntry({
            title: 'GitHub',
            username: 'alice',
            password: 'secret-token-xyz',
            notes: 'Production credentials',
            tags: ['work', 'git']
        });
        expect(err1).toBe(null);

        const initialRevision = v1.metadata.revision;
        const initialSalt = v1.metadata.kdf?.salt;

        // Change master password
        const [rotatedVault, rotateErr] = await v1.changeMasterPassword(newPassword);
        expect(rotateErr).toBe(null);
        expect(rotatedVault).not.toBe(null);
        expect(rotatedVault.metadata.revision).toBe(initialRevision + 1);
        expect(rotatedVault.metadata.kdf?.lastRotated).toBeDefined();

        // Salt must be rotated to a fresh distinct value
        expect(rotatedVault.metadata.kdf?.salt).not.toBe(initialSalt);

        // Lock and unlock with the NEW password
        const serialized = rotatedVault.toJSON();
        const locked = rotatedVault.lock();
        expect(locked.isUnlocked).toBe(false);

        const [reopened, unlockErr] = await PasswordVault.fromJSON(serialized, newPassword);
        expect(unlockErr).toBe(null);
        expect(reopened.isUnlocked).toBe(true);

        // Decrypt and verify entry data identity
        const [sessionKey] = await reopened._getSessionKey();
        expect(sessionKey).not.toBe(null);
        const [decrypted, decErr] = await reopened.entries[0].decrypt(sessionKey);
        expect(decErr).toBe(null);
        expect(decrypted.title).toBe('GitHub');
        expect(decrypted.username).toBe('alice');
        expect(decrypted.password).toBe('secret-token-xyz');
        expect(decrypted.notes).toBe('Production credentials');
        expect(decrypted.tags).toEqual(['work', 'git']);
    });

    it('fails closed when attempting to unlock a rotated vault with the old password', async () => {
        const initialPassword = 'valid-password-1';
        const newPassword = 'valid-password-2';

        const vault = new PasswordVault([], null, true, initialPassword);
        const [v1] = await vault.addEntry({ title: 'Bank', password: 'pin' });
        const [rotatedVault, rotErr] = await v1.changeMasterPassword(newPassword);
        expect(rotErr).toBe(null);

        const locked = rotatedVault.lock();
        const [, failErr] = await PasswordVault.fromJSON(locked.toJSON(), initialPassword);
        expect(failErr).toBeInstanceOf(Error);
        expect(failErr.message.toLowerCase()).toContain('password');
    });

    it('honors custom high iteration counts (>= 600,000)', async () => {
        const pw = 'custom-iter-password';
        const newPw = 'new-custom-iter-password';
        const customIterations = 1000000;

        const vault = new PasswordVault([], null, true, pw);
        const [rotatedVault, err] = await vault.changeMasterPassword(newPw, { iterations: customIterations });
        expect(err).toBe(null);
        expect(rotatedVault.metadata.kdf?.iterations).toBe(customIterations);

        // Verify successful unlock with custom iteration count
        const serialized = rotatedVault.toJSON();
        const locked = rotatedVault.lock();
        expect(locked.isUnlocked).toBe(false);
        const [unlocked, unlockErr] = await PasswordVault.fromJSON(serialized, newPw);
        expect(unlockErr).toBe(null);
        expect(unlocked.isUnlocked).toBe(true);
    });

    it('strictly rejects iteration counts below 600,000', async () => {
        const pw = 'pass';
        const vault = new PasswordVault([], null, true, pw);

        const [, badErr1] = await vault.changeMasterPassword('new-pass', { iterations: 599999 });
        expect(badErr1).toBeInstanceOf(Error);
        expect(badErr1.message).toMatch(/600,?000/);

        const [, badErr2] = await vault.changeMasterPassword('new-pass', { iterations: 100000 });
        expect(badErr2).toBeInstanceOf(Error);

        const [, badErr3] = await vault.changeMasterPassword('new-pass', { iterations: 0 });
        expect(badErr3).toBeInstanceOf(Error);

        const [, badErr4] = await vault.changeMasterPassword('new-pass', { iterations: 10000001 });
        expect(badErr4).toBeInstanceOf(Error);
    });

    it('rejects password rotation on a locked vault or empty password input', async () => {
        const locked = new PasswordVault([], null, false);
        const [, lockErr] = await locked.changeMasterPassword('new-password');
        expect(lockErr).toBeInstanceOf(Error);
        expect(lockErr.message.toLowerCase()).toContain('locked');

        const unlocked = new PasswordVault([], null, true, 'current-pass');
        const [, emptyErr1] = await unlocked.changeMasterPassword('');
        expect(emptyErr1).toBeInstanceOf(Error);

        const [, emptyErr2] = await unlocked.changeMasterPassword('   ');
        expect(emptyErr2).toBeInstanceOf(Error);

        const [, nonStringErr] = await unlocked.changeMasterPassword(null);
        expect(nonStringErr).toBeInstanceOf(Error);
    });

    it('calculates getPasswordAgeDays accurately', async () => {
        const pastDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
        const metadata = {
            version: '3.0',
            revision: 1,
            created: pastDate,
            kdf: {
                algo: 'PBKDF2-SHA256',
                iterations: 600000,
                salt: 'dGVzdHNhbHQ=',
                wrapIV: 'dGVzdGl2',
                wrappedSessionKey: 'dGVzdGtleQ==',
                lastRotated: pastDate
            }
        };

        const vault = new PasswordVault([], metadata, true, 'pw');
        expect(vault.getPasswordAgeDays()).toBeGreaterThanOrEqual(44);
        expect(vault.getPasswordAgeDays()).toBeLessThanOrEqual(46);
    });

    it('Property: Decryption identity holds across randomized rotation chains (PBT)', async () => {
        await assertProperty(
            [
                Arbitrary.string(8, 24),
                Arbitrary.string(8, 24),
                Arbitrary.string(8, 24),
                Arbitrary.string(1, 30),
                Arbitrary.string(8, 32)
            ],
            async (p0, p1, p2, title, secret) => {
                const vault = new PasswordVault([], null, true, p0);
                const [v1, addErr] = await vault.addEntry({ title, password: secret });
                expect(addErr).toBe(null);

                // Rotate p0 -> p1
                const [v2, rotErr1] = await v1.changeMasterPassword(p1);
                expect(rotErr1).toBe(null);

                // Rotate p1 -> p2
                const [v3, rotErr2] = await v2.changeMasterPassword(p2);
                expect(rotErr2).toBe(null);

                // Verify unlock with final password p2
                const serializedPbt = v3.toJSON();
                const [unlocked, unlockErr] = await PasswordVault.fromJSON(serializedPbt, p2);
                expect(unlockErr).toBe(null);

                const [sessionKey] = await unlocked._getSessionKey();
                const [plain, decErr] = await unlocked.entries[0].decrypt(sessionKey);
                expect(decErr).toBe(null);
                expect(plain.title).toBe(title);
                expect(plain.password).toBe(secret);
            },
            10
        );
    });

    it('Metamorphic MR3: Multistep rotation preserves bit-exact serialization and entry set', async () => {
        const pwInitial = 'initial-pw';
        const vault = new PasswordVault([], null, true, pwInitial);
        const [v1] = await vault.addEntry({ title: 'EntryA', password: 'SecretA', tags: ['t1'] });
        const [v2] = await v1.addEntry({ title: 'EntryB', password: 'SecretB', tags: ['t2'] });

        // Save original entries JSON
        const origEntriesJson = JSON.stringify(v2.entries.map(e => e.toJSON()));

        // Perform 3 rotations
        const [r1] = await v2.changeMasterPassword('pw-step-1');
        const [r2] = await r1.changeMasterPassword('pw-step-2');
        const [r3] = await r2.changeMasterPassword('pw-final');

        // Entries representation must remain bit-for-bit identical
        const rotatedEntriesJson = JSON.stringify(r3.entries.map(e => e.toJSON()));
        expect(rotatedEntriesJson).toBe(origEntriesJson);
    });
});
