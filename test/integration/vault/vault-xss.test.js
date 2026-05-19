import { describe, it, expect } from '../../utils/test-runner.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('VaultView XSS Protection', () => {
    it('should correctly escape HTML entities in strings', async () => {
        const view = new VaultView(null, null);

        // PBT for XSS escaping
        await assertProperty([Arbitrary.string(1, 100)], input => {
            const safe = view.escape(input);
            if (input == null) {
                return safe === '';
            }
            return !safe.includes('<') && !safe.includes('>') && !safe.includes('"') && !safe.includes("'");
        });
    });
});
