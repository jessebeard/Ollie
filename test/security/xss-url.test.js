import { describe, it } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Security', () => {
    it('prevents javascript: URIs in window.open via sanitizeUrl', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string()],
            async (maliciousUrl) => {
                const sanitized = view.sanitizeUrl(maliciousUrl);
                const isMalicious = ['javascript:', 'data:', 'vbscript:'].some(proto =>
                   sanitized.toLowerCase().startsWith(proto) ||
                   sanitized.toLowerCase().replace(/[\x00-\x20\x7F]/g, '').startsWith(proto)
                );
                if (isMalicious && sanitized !== 'about:blank') return false;
                return true;
            }
        );
    });
});
