import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('URL Sanitization Security', () => {
    it('should reject dangerous protocols in URLs', () => {
        const view = new VaultView(null, null);

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('  javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('j a v a s c r i p t : alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('\x01javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('Property: URL sanitization always prevents javascript:, data:, and vbscript: protocols', async () => {
        const view = new VaultView(null, null);
        await assertProperty(
            [Arbitrary.string(1, 50)],
            (str) => {
                const sanitized = view.sanitizeUrl(str);
                if (sanitized === 'about:blank') return true;
                const cleanNoSpace = String(sanitized).replace(/[\x00-\x20\x7F]/g, '');
                try {
                    const parsed = new URL(cleanNoSpace, 'http://dummy.base');
                    const protocol = parsed.protocol.toLowerCase();
                    return !['javascript:', 'data:', 'vbscript:'].includes(protocol);
                } catch (e) {
                    return true;
                }
            }
        );
    });
});
