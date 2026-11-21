import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';

const PASSWORD = 'gate-test-pw';

function makeUnlocked() {
    return new PasswordVault([], null, true, PASSWORD);
}

describe('TOTP gate (Tier B access control)', () => {
    it('enableTotpGate returns an enrollment URI and stores the gate', async () => {
        const v = makeUnlocked();
        const [gate, err] = await v.enableTotpGate();
        expect(err).toBe(null);
        expect(gate.uri).toMatch(/^otpauth:\/\/totp\//);
        expect(gate.vault.metadata.totpGate && gate.vault.metadata.totpGate.secret).toBeTruthy();
        expect(gate.uri).toContain(gate.vault.metadata.totpGate.secret);

        // Immutability: original instance untouched, new one carries the gate
        expect(v.metadata.totpGate).toBeUndefined();
    });

    it('verifyTotpGate accepts the live code and +-1 window, rejects others', async () => {
        let v = makeUnlocked();
        const [gate, err] = await v.enableTotpGate();
        expect(err).toBe(null);
        v = gate.vault;

        // Derive codes from the enrollment URI itself at fixed times.
        const { codeFromOtpauthUri } = await import('../../src/information-theory/cryptography/totp.js');
        const NOW = 1_700_000_045;
        const [cur] = await codeFromOtpauthUri(gate.uri, { now: NOW });
        const [prev] = await codeFromOtpauthUri(gate.uri, { now: NOW - 30 });

        const [okNow] = await v.verifyTotpGate(cur, { now: NOW });
        expect(okNow.valid).toBe(true);
        const [okPrev] = await v.verifyTotpGate(prev, { now: NOW, window: 1 });
        expect(okPrev.valid).toBe(true);

        const [farCode] = await codeFromOtpauthUri(gate.uri, { now: NOW + 3000 });
        const [farRes] = await v.verifyTotpGate(farCode, { now: NOW, window: 1 });
        expect(farRes.valid).toBe(false);
        const [badRes] = await v.verifyTotpGate('000000', { now: NOW });
        expect(badRes.valid).toBe(false);
    });

    it('persists the gate across encrypted export/import', async () => {
        let v = makeUnlocked();
        const [gate] = await v.enableTotpGate();
        v = gate.vault;
        const [json, expErr] = await v.exportEncrypted(PASSWORD);
        expect(expErr).toBe(null);

        const [restored, impErr] = await PasswordVault.importEncrypted(json, PASSWORD);
        expect(impErr).toBe(null);
        expect(restored.metadata.totpGate).toBeDefined();
        expect(gate.uri).toContain(restored.metadata.totpGate.secret);
    });

    it('disableTotpGate removes the gate', async () => {
        let v = makeUnlocked();
        const [gate] = await v.enableTotpGate();
        v = gate.vault;
        const [cleared, err] = await v.disableTotpGate();
        expect(err).toBe(null);
        expect(cleared.metadata.totpGate).toBeUndefined();
    });

    it('refuses gate operations on locked vaults', async () => {
        const locked = new PasswordVault([], null, false, null);
        const [, e1] = await locked.enableTotpGate();
        expect(e1).toBeInstanceOf(Error);
        const [, e2] = await locked.verifyTotpGate('123456');
        expect(e2).toBeInstanceOf(Error);
        const [, e3] = await locked.disableTotpGate();
        expect(e3).toBeInstanceOf(Error);
    });

    it('rejects malformed codes as {valid:false} without throwing', async () => {
        let v = makeUnlocked();
        const [gate] = await v.enableTotpGate();
        v = gate.vault;
        const [res] = await v.verifyTotpGate('not-a-code');
        expect(res.valid).toBe(false);
    });
});

