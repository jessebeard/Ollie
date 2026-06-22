import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView - URL Sanitization', () => {
    // Create a mock instance since we only need to test pure method sanitizeUrl
    const view = new VaultView(null, null);

    it('should never allow javascript:, data:, or vbscript: protocols', async () => {
        const payloadArb = Arbitrary.string();

        await assertProperty([payloadArb], (payload) => {
            const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
            for (const proto of dangerousProtocols) {
                // Test plain protocol + payload
                const url1 = `${proto}${payload}`;
                const sanitized1 = view.sanitizeUrl(url1);
                if (sanitized1 !== 'about:blank') return false;

                // Test with spaces/control characters mixed in
                const url2 = ` \x00 ${proto}${payload}`;
                const sanitized2 = view.sanitizeUrl(url2);
                if (sanitized2 !== 'about:blank') return false;
            }
            return true;
        });
    });

    it('should allow safe protocols and schemeless domains', async () => {
        const payloadArb = Arbitrary.string(1, 20); // Keep it small to form valid URLs

        await assertProperty([payloadArb], (payload) => {
            // only test alphanumeric payloads to avoid invalid URLs that fail parsing
            const safePayload = payload.replace(/[^a-zA-Z0-9]/g, 'a') + '1';

            // Test standard safe protocol
            const url1 = `https://example.com/${safePayload}`;
            const sanitized1 = view.sanitizeUrl(url1);
            if (sanitized1 !== url1) return false;

            // Test schemeless URL
            const url2 = `example.com/${safePayload}`;
            const sanitized2 = view.sanitizeUrl(url2);
            if (sanitized2 !== url2) return false;

            return true;
        });
    });
});
