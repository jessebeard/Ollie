import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';

describe('VaultView XSS Prevention', () => {
    it('should correctly escape HTML structural characters and single quotes', async () => {
        const view = new VaultView(null, null);
        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = view.escape(str);

                if (String(str).includes("'") && !escaped.includes("&#39;")) {
                    return false;
                }
                if (String(str).includes("<") && !escaped.includes("&lt;")) {
                    return false;
                }
                return true;
            }
        );
    });
});
