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
});

describe('VaultView URL Security', () => {
    it('should neutralize malicious URL schemes including those with interleaved spaces', async () => {
        const view = new VaultView(null, null);

        // Specific adversarial test cases
        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('vbscript:msgbox(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank');
        expect(view.sanitizeUrl('j a v a s c r i p t : alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('java\x00script:alert(1)')).toBe('about:blank');

        // Legitimate URLs should pass through
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('http://example.com/a b')).toBe('http://example.com/a b');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');
        expect(view.sanitizeUrl('')).toBe('');

        // Property-based test: ensure sanitized URLs never start with malicious protocols
        await assertProperty(
            [Arbitrary.string(1, 50)],
            (str) => {
                const sanitized = view.sanitizeUrl(str);
                const checkStr = sanitized.replace(/[\x00-\x20\x7F]/g, '').toLowerCase();
                return !checkStr.startsWith('javascript:') &&
                       !checkStr.startsWith('vbscript:') &&
                       !checkStr.startsWith('data:');
            }
        );
    });
});
