import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { encodeQR } from '../../../src/codec/qr-encoder.js';

/**
 * Card-level QR acceptance: dropping/clicking a QR image inside the card
 * populates the entry's TOTP secret. The capture pipeline (createImageBitmap
 * + canvas) is browser-only; tests inject ready-made ImageData through the
 * same entry point the event handler uses.
 */

function synthesize(matrix, scale = 4) {
    const quiet = 4;
    const dim = (matrix.size + quiet * 2) * scale;
    const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
    for (let r = 0; r < matrix.size; r++) for (let c = 0; c < matrix.size; c++) {
        if (!matrix.modules[r * matrix.size + c]) continue;
        for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
            const y = (r + quiet) * scale + py, x = (c + quiet) * scale + px;
            const i = (y * dim + x) * 4; data[i]=0; data[i+1]=0; data[i+2]=0;
        }
    }
    return { data, width: dim, height: dim };
}

const PASSWORD = 'qr-scan-pw';

async function makeUnlockedVaultWithEntry() {
    let v = new PasswordVault([], null, true, PASSWORD);
    [v] = await v.addEntry({ title: 'Example', password: 'pw' });
    return v;
}

describe('Vault QR scan application', () => {
    it('populates the entry TOTP from a valid otpauth QR image', async () => {
        const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
        const uri = 'otpauth://totp/Example:alice?secret=GEZDGNBVGY3TQOJQ&issuer=Example';

        const alerts = [];
        const ui = Object.create(VaultUI.prototype);
        ui.modals = { showAlert: async (t, m) => alerts.push(t + ': ' + m) };
        ui.showLoading = () => {};
        ui.updateUI = () => {};
        ui.vault = await makeUnlockedVaultWithEntry();
        const id = ui.vault.entries[0].id;

        await ui.applyScannedImage(id, synthesize(encodeQR(new TextEncoder().encode(uri))));

        expect(alerts.some(a => a.includes('TOTP'))).toBe(true);
        const [sessionKey] = await ui.vault._getSessionKey();
        const [plain] = await ui.vault.entries[0].decrypt(sessionKey);
        if (plain.totp !== uri) throw new Error(`stored totp mismatch: ${plain.totp}`);
    });

    it('rejects non-TOTP QR payloads with an alert and stores nothing', async () => {
        const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
        const alerts = [];
        const ui = Object.create(VaultUI.prototype);
        ui.modals = { showAlert: async (t, m) => alerts.push(t + ': ' + m) };
        ui.showLoading = () => {};
        ui.updateUI = () => {};
        ui.vault = await makeUnlockedVaultWithEntry();
        const id = ui.vault.entries[0].id;

        await ui.applyScannedImage(id, synthesize(encodeQR(new TextEncoder().encode('https://example.com/not-a-totp'))));

        expect(alerts.some(a => a.includes('otpauth') || a.includes('TOTP'))).toBe(true);
        const [sessionKey] = await ui.vault._getSessionKey();
        const [plain] = await ui.vault.entries[0].decrypt(sessionKey);
        if (plain.totp) throw new Error('non-TOTP QR stored anyway');
    });

    it('surfaces undecodable images as a typed alert', async () => {
        const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
        const alerts = [];
        const ui = Object.create(VaultUI.prototype);
        ui.modals = { showAlert: async (t, m) => alerts.push(t + ': ' + m) };
        ui.showLoading = () => {};
        ui.updateUI = () => {};
        ui.vault = await makeUnlockedVaultWithEntry();

        const blank = { data: new Uint8ClampedArray(80 * 80 * 4).fill(255), width: 80, height: 80 };
        await ui.applyScannedImage(ui.vault.entries[0].id, blank);

        expect(alerts.length).toBe(1);
    });
});
