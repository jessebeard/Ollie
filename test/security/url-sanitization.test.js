import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Sanitization', () => {
    it('prevents javascript:, data:, and vbscript: URIs in window.open', async () => {
        const view = new VaultView(null, null);

        const isSafe = (url) => {
            if (url === 'about:blank' || url === '') return true;
            try {
                // If the cleaned URL still resolves to a dangerous protocol, it's a fail
                const parsed = new URL(url.replace(/[\x00-\x20\x7F]/g, ''), 'http://dummy.base');
                const p = parsed.protocol.toLowerCase();
                return !['javascript:', 'data:', 'vbscript:'].includes(p);
            } catch (e) {
                return true;
            }
        };

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('j a v a s c r i p t : alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('vbscript:msgbox(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank');
        expect(view.sanitizeUrl('   javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('\x01javascript:alert(1)')).toBe('about:blank');

        // Legitimate URLs should pass through
        expect(view.sanitizeUrl('https://google.com')).toBe('https://google.com');
        expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');

        await assertProperty(
            [Arbitrary.string()],
            (url) => {
                const sanitized = view.sanitizeUrl(url);
                return isSafe(sanitized);
            }
        );
    });
});
