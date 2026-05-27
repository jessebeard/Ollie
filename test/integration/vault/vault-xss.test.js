import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';

describe('Vault XSS Prevention', () => {

    it('should escape malicious input in vault-view.js', async () => {
        // VaultView can be instantiated without real DOM if we only test pure methods
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (input) => {
                const result = view.escape(input);
                // Assert no unescaped quotes or HTML tags are present
                return !result.includes('"') && !result.includes("'") && !result.includes('<') && !result.includes('>');
            },
            100
        );

        const maliciousInput = '"><script>alert(1)</script>';
        const result = view.escape(maliciousInput);

        expect(result.includes('<script>')).toBe(false);
        expect(result.includes('"><script>')).toBe(false);
        expect(result.includes('&#39;')).toBe(false); // No single quotes in input
    });
});
