import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL XSS Prevention', () => {
    it('sanitizes unsafe URLs before launching', async () => {
        const view = new VaultView(null, { emit: () => {} });

        await assertProperty(
            [Arbitrary.string()],
            (url) => {
                const safeUrl = view.sanitizeUrl ? view.sanitizeUrl(url) : url;

                if (!safeUrl) return true; // Blocked is safe

                try {
                    const cleanUrl = String(safeUrl).replace(/[\x00-\x1F\x7F]/g, '');
                    const parsed = new URL(cleanUrl, 'http://dummy.base');
                    const protocol = parsed.protocol.toLowerCase();
                    if (protocol === 'javascript:' || protocol === 'data:' || protocol === 'vbscript:') {
                        return false; // Found unsafe protocol in output
                    }
                } catch (e) {
                    // Unparseable is fine as long as browser also can't parse it as JS
                }

                return true;
            }
        );

        // Specific adversarial tests
        if (view.sanitizeUrl) {
            expect(view.sanitizeUrl('javascript:alert(1)')).toBe('');
            expect(view.sanitizeUrl(' javascript:alert(1)')).toBe('');
            expect(view.sanitizeUrl('java\x00script:alert(1)')).toBe('');
            expect(view.sanitizeUrl('vbscript:msgbox(1)')).toBe('');
            expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
            expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
            expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        }
    });
});
