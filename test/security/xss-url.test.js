import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Security', () => {
    it('sanitizes malicious URLs before window.open', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string()],
            (str) => {
                const escaped = view.sanitizeUrl(str);
                if (!escaped) return true; // Rejected strings are safe

                // If it wasn't rejected, ensure it doesn't have a malicious protocol
                const validationUrl = String(escaped).replace(/[\x00-\x20\x7F]/g, '');
                try {
                    const parsed = new URL(validationUrl, 'http://localhost');
                    return ['http:', 'https:'].includes(parsed.protocol.toLowerCase());
                } catch(e) {
                    return false;
                }
            }
        );

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe(null);
        expect(view.sanitizeUrl('j a v a s c r i p t:alert(1)')).toBe(null);
        expect(view.sanitizeUrl('data:text/html,<h1>XSS</h1>')).toBe(null);
        expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
    });
});
