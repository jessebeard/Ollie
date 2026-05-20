import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('Security: VaultView XSS Prevention', () => {
    it('should correctly escape HTML attributes in user input to prevent XSS breakouts', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = view.escape(str);
                if (str.includes('<')) expect(escaped.includes('<')).toBe(false);
                if (str.includes('>')) expect(escaped.includes('>')).toBe(false);
                if (str.includes('"')) expect(escaped.includes('"')).toBe(false);
                if (str.includes("'")) expect(escaped.includes("'")).toBe(false);
                return true;
            }
        );
    });
});
