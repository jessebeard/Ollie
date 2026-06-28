import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL XSS Prevention', () => {
    it('should strictly sanitize URLs and reject dangerous protocols', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (maliciousInput) => {
                const sanitized = view.sanitizeUrl(maliciousInput);
                if (!sanitized) return true; // Rejected is safe
                const lower = sanitized.toLowerCase();
                return !lower.startsWith('javascript:') &&
                       !lower.startsWith('data:') &&
                       !lower.startsWith('vbscript:');
            }
        );

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl(' javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('java\x00script:alert(1)')).toBe('');
        expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');
    });
});
