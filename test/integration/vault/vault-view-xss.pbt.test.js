import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';

describe('VaultView Security Properties', () => {
    it('escapes all structural HTML characters to prevent XSS and attribute injection', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            async (payload) => {
                const escaped = view.escape(payload);
                const hasUnescapedStructuralChars = /[<>"']/.test(escaped);
                return !hasUnescapedStructuralChars;
            }
        );
    });

    it('safely handles non-string inputs without throwing TypeErrors', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.integer(-1000, 1000)],
            async (payload) => {
                let escaped;
                try {
                    escaped = view.escape(payload);
                } catch (e) {
                    return false;
                }
                return typeof escaped === 'string';
            }
        );
    });
});
