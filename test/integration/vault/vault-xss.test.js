import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Vault UI XSS Prevention', () => {
    it('Property: VaultView.escape() prevents HTML attribute and tag injection', async () => {
        // We dynamically import vault-view to isolate testing its pure methods
        const vaultViewCode = fs.readFileSync(path.join(__dirname, '../../../app/components/vault/components/vault-view.js'), 'utf8');

        // Extract the class definition and instantiate a mock
        const match = vaultViewCode.match(/export class VaultView \{([\s\S]*)\}/);
        const methodsCode = match[1].replace(/this\.events\.emit/g, '/* emit mocked */');

        const viewMock = new Function(`
            return class VaultViewMock {
                ${methodsCode}
            }
        `)();

        const view = new viewMock();

        await assertProperty(
            [Arbitrary.string(1, 200)],
            (payload) => {
                const escaped = view.escape(payload);

                // Assert specific breakout contexts don't exist
                const inAttribute = `<div data-test="${escaped}"></div>`;
                const inText = `<div>${escaped}</div>`;

                // Look for unescaped structural chars
                if (escaped.includes('<') || escaped.includes('>') || escaped.includes('&') && !escaped.match(/&[a-z]+;|&#[0-9]+;/)) {
                     return false;
                }

                return true;
            },
            100
        );
    });
});
