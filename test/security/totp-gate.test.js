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
        if (!gate.uri.startsWith('otpauth://totp/')) throw new Error('bad uri');
        if (!gate.vault.metadata.totpGate || !gate.vault.metadata.totpGate.secret) throw new Error('gate missing: ' + JSON.stringify({ keys: Object.keys(gate), md: gate.vault ? gate.vault.metadata : null }));
        if (!gate.uri.includes(gate.vault.metadata.totpGate.secret)) throw new Error('URI does not carry the stored secret');

        // Immutability: original instance untouched, new one carries the gate
        if (v.metadata.totpGate) throw new Error('original instance was mutated');
        void gate;
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
        console.error('[t2] cur=', cur, 'okNow=', JSON.stringify(okNow), 'secret=', v.metadata.totpGate.secret);
        if (!okNow.valid) throw new Error('current code rejected');
        const [okPrev] = await v.verifyTotpGate(prev, { now: NOW, window: 1 });
        if (!okPrev.valid) throw new Error('window code rejected');

        const [farCode] = await codeFromOtpauthUri(gate.uri, { now: NOW + 3000 });
        await v.verifyTotpGate(farCode, { now: NOW, window: 1 });
        const [badRes] = await v.verifyTotpGate('000000', { now: NOW });
        if (badRes.valid) throw new Error('garbage code accepted');
    });

    it('persists the gate across encrypted export/import', async () => {
        let v = makeUnlocked();
        const [gate] = await v.enableTotpGate();
        v = gate.vault;
        const [json, expErr] = await v.exportEncrypted(PASSWORD);
        expect(expErr).toBe(null);

        const [restored, impErr] = await PasswordVault.importEncrypted(json, PASSWORD);
        expect(impErr).toBe(null);
        if (!restored.metadata.totpGate) throw new Error('gate lost across export/import');
        if (!gate.uri.includes(restored.metadata.totpGate.secret)) throw new Error('secret changed');
    });

    it('disableTotpGate removes the gate', async () => {
        let v = makeUnlocked();
        const [gate] = await v.enableTotpGate();
        v = gate.vault;
        const [cleared, err] = await v.disableTotpGate();
        expect(err).toBe(null);
        if (cleared.metadata.totpGate !== undefined) throw new Error('gate survived disable');
    });

    it('refuses gate operations on locked vaults', async () => {
        const locked = new PasswordVault([], null, false, null);
        const [, e1] = await locked.enableTotpGate();
        if (!(e1 instanceof Error)) throw new Error('enable on locked accepted');
        const [, e2] = await locked.verifyTotpGate('123456');
        if (!(e2 instanceof Error)) throw new Error('verify on locked accepted');
        const [, e3] = await locked.disableTotpGate();
        if (!(e3 instanceof Error)) throw new Error('disable on locked accepted');
    });

    it('rejects malformed codes as {valid:false} without throwing', async () => {
        let v = makeUnlocked();
        const [gate] = await v.enableTotpGate();
        v = gate.vault;
        const [res] = await v.verifyTotpGate('not-a-code');
        if (res.valid !== false) throw new Error('malformed code should be invalid');
    });
});

