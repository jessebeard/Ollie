import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('URL Sanitize', () => {
    it('Property: sanitized output never contains executable protocols', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const sanitized = view.sanitizeUrl(str);
                if (sanitized === 'about:blank') return true;

                const testUrl = sanitized.replace(/[\x00-\x20\x7F]/g, '');
                try {
                    const parsed = new URL(testUrl, 'http://dummy.base');
                    const protocol = parsed.protocol.toLowerCase();
                    return !['javascript:', 'vbscript:', 'data:'].includes(protocol);
                } catch (e) {
                    return true;
                }
            }
        );
    });
    it('rejects specific malicious inputs', () => {
        const view = new VaultView(null, null);
        expect(view.sanitizeUrl('j a v a s c r i p t : alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl(' javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('javascript:alert("http://example.com")')).toBe('about:blank');
        expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
    });
});
