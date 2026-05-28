import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';

let VaultViewClass;

// Extract VaultView to test its escape function
if (typeof document === 'undefined') {
    const code = fs.readFileSync('app/components/vault/components/vault-view.js', 'utf8');
    const funcBody = code.replace(/export class/g, 'class');
    const extract = new Function(`
        ${funcBody}
        return VaultView;
    `);
    VaultViewClass = extract();
} else {
    // Browser environment - we can't easily import the class directly if it's not exposed
    // We'll skip the pure unit test of the class in browser for now to avoid complexity,
    // or we'd need to mock it differently.
}

describe('Vault Security (XSS Prevention)', () => {

    it('Property: VaultView.escape() mitigates HTML injection and attribute breakouts', () => {
        if (!VaultViewClass) return; // Skip in browser

        const view = new VaultViewClass(null, null);

        const maliciousPayloads = [
            Arbitrary.string(),
            () => '"><img src=x onerror=alert(1)>',
            () => '\' onfocus=\'alert(1)\'',
            () => '<script>alert(1)</script>',
            () => 'javascript:alert(1)',
            () => 'javascript://%250Aalert(1)',
        ];

        for (const payloadGen of maliciousPayloads) {
            assertProperty(payloadGen, (input) => {
                const escaped = view.escape(input);

                // Assert no raw structural HTML characters exist in the output
                if (escaped.includes('<') || escaped.includes('>') || escaped.includes('"') || escaped.includes("'")) {
                    throw new Error(`Escape failed to sanitize structural characters: ${escaped}`);
                }
            });
        }
    });

});
