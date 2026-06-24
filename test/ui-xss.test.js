import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { VaultView } from '../app/components/vault/components/vault-view.js';

describe('VaultView XSS Prevention', () => {
    it('should correctly escape HTML characters without failing on non-strings', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = view.escape(str);
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(view.escape(123)).toBe("123");
        expect(view.escape(true)).toBe("true");
        expect(view.escape(null)).toBe("");
        expect(view.escape(undefined)).toBe("");
        expect(view.escape(0)).toBe("0");
        expect(view.escape(false)).toBe("false");
    });

    it('should sanitize dangerous URLs while preserving safe ones', () => {
        const view = new VaultView(null, null);

        // Safe URLs
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('http://test.com/path?q=1')).toBe('http://test.com/path?q=1');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');

        // Dangerous protocols
        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank');
        expect(view.sanitizeUrl('vbscript:msgbox(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('JAVAScript:alert(1)')).toBe('about:blank');

        // Evasion attempts with control characters
        expect(view.sanitizeUrl('\x00javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('java\x09script:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('java\x00script:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('  javascript:alert(1)')).toBe('about:blank');
    });
});
