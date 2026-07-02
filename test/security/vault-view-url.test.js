import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Sanitization Security', () => {
    it('should correctly sanitize malicious URLs', async () => {
        const view = new VaultView(null, null);

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('j a v a s c r i p t:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('\x00javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');
        expect(view.sanitizeUrl('https://example.com/spaced path')).toBe('https://example.com/spaced path');

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (input) => {
                const result = view.sanitizeUrl(input);
                if (/[\x00-\x1F\x7F]/.test(result)) return false;

                if (result === 'about:blank') return true;

                const evalStr = String(result).replace(/[\x00-\x20\x7F]/g, '');
                try {
                    const url = new URL(evalStr, 'http://dummy.base');
                    const proto = url.protocol.toLowerCase();
                    if (['javascript:', 'data:', 'vbscript:', 'file:'].includes(proto)) {
                        return false;
                    }
                } catch (e) {
                    // Ignore URL parsing errors
                }
                return true;
            }
        );
    });
});
