import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Sanitization Security', () => {
    it('prevents dangerous protocols from being used in window.open', async () => {
        const view = new VaultView(null, null);

        // Ensure known dangerous URLs are rejected
        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
        expect(view.sanitizeUrl('vbscript:msgbox(1)')).toBe('');

        // Ensure safe URLs pass through
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');

        await assertProperty(
            [Arbitrary.string(1, 50)],
            (str) => {
                const url = `javascript:${str}`;
                const sanitized = view.sanitizeUrl(url);
                return sanitized === '';
            }
        );
    });
});
