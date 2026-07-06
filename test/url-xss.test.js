import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { VaultView } from '../app/components/vault/components/vault-view.js';

describe('VaultView URL XSS Prevention', () => {
    it('should correctly sanitize URLs and prevent malicious protocols', async () => {
        const view = new VaultView(null, null);

        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('http://test.com')).toBe('http://test.com');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
        expect(view.sanitizeUrl('vbscript:msgbox("test")')).toBe('');

        expect(view.sanitizeUrl('java\x00script:alert(1)')).toBe('');
        expect(view.sanitizeUrl(' java script : alert(1)')).toBe('');
        expect(view.sanitizeUrl('\x1Fjavascript:alert(1)')).toBe('');

        expect(view.sanitizeUrl('https://example.com/path with spaces')).toBe('https://example.com/path with spaces');

        await assertProperty(
            [Arbitrary.string(1, 50)],
            (str) => {
                const sanitized = view.sanitizeUrl(str);
                const urlForVal = sanitized.replace(/[\x00-\x20\x7F]/g, '');
                try {
                    const parsed = new URL(urlForVal, 'http://dummy.base');
                    const p = parsed.protocol.toLowerCase();
                    return p !== 'javascript:' && p !== 'data:' && p !== 'vbscript:';
                } catch {
                    return true;
                }
            }
        );
    });
});
