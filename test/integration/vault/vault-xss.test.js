import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '../../../app');

describe('Vault UI XSS Prevention', () => {

    it('escapes user input in modal prompts', async () => {
        if (typeof document === 'undefined') {
            globalThis.document = {
                createElement: () => ({ style: {}, focus: () => {}, querySelector: () => ({ value: '', onclick: () => {}, onkeydown: () => {}, focus: () => {} }), appendChild: () => {}, classList: { add: () => {} } }),
                body: { appendChild: () => {} }
            };
        }

        const content = fs.readFileSync(path.join(appDir, 'components/vault/components/modal-manager.js'), 'utf8');
        const stripped = content.replace(/export /g, '');
        const evalEnv = `
            ${stripped}
            return new ModalManager();
        `;
        const getManager = new Function(evalEnv);
        const manager = getManager();

        manager.overlay = { appendChild: function(el) { this.innerHTML = el.innerHTML; }, style: {} };

        await assertProperty(
            [Arbitrary.string(1, 20)],
            async (maliciousString) => {
                manager.showAlert(maliciousString, "message");
                const html = manager.overlay.innerHTML;
                if (!html) return false;

                // Expect structural HTML like '<' to be escaped, avoiding breakage
                if (maliciousString.includes('<') && html.includes(maliciousString)) {
                     return false;
                }

                return true;
            },
            20
        );
    });
});
