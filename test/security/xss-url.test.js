import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Sanitization Property Test', () => {
    it('should sanitize javascript:, data:, and vbscript: URLs correctly', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const sanitized = view.sanitizeUrl(str);
                if (sanitized === '') return true;

                const parsed = new URL(sanitized, 'http://dummy.base');
                return !['javascript:', 'data:', 'vbscript:'].includes(parsed.protocol);
            }
        );
    });
});
