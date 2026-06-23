import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('URL Sanitization', () => {
    it('should correctly sanitize malicious URLs in VaultView', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const sanitized = view.sanitizeUrl("javascript:" + str);
                return sanitized === 'about:blank';
            }
        );

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const sanitized = view.sanitizeUrl("data:" + str);
                return sanitized === 'about:blank';
            }
        );

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const sanitized = view.sanitizeUrl("vbscript:" + str);
                return sanitized === 'about:blank';
            }
        );

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl(' javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('java\x00script:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');
    });
});
