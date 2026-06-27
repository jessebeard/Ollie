import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL XSS Prevention', () => {
    it('should sanitize javascript:, data:, and vbscript: URLs correctly', () => {
        const view = new VaultView(null, null);

        // Standard test cases
        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('   javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl(' \x00javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
        expect(view.sanitizeUrl('vbscript:msgbox("XSS")')).toBe('');

        // Allowed URLs
        expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');

        // PBT for malicious protocol variations
        assertProperty(
            [Arbitrary.string(1, 20)],
            (prefix) => {
                const maliciousUrl = `${prefix}javascript:alert(1)`;
                const sanitized = view.sanitizeUrl(maliciousUrl);
                // The URL is either completely rejected (empty string),
                // or if it parses, it must not be javascript:
                if (sanitized !== '') {
                    try {
                        const parsed = new URL(sanitized, 'http://dummy.base');
                        return parsed.protocol !== 'javascript:';
                    } catch (e) {
                        return true; // if it doesn't parse it's probably safe
                    }
                }
                return true;
            }
        );
    });
});
