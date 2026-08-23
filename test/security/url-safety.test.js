import { describe, it, expect } from '../utils/test-runner.js';
import { isSafeHttpUrl } from '../../src/utils/url-safety.js';

describe('URL safety whitelist', () => {

    it('accepts standard http(s) URLs', () => {
        expect(isSafeHttpUrl('https://example.com/login')).toBe(true);
        expect(isSafeHttpUrl('http://example.com')).toBe(true);
        expect(isSafeHttpUrl('HTTPS://EXAMPLE.COM/PATH')).toBe(true);
    });

    it('rejects script-bearing schemes', () => {
        expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeHttpUrl('JaVaScRiPt:alert(1)')).toBe(false);
        expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
        expect(isSafeHttpUrl('vbscript:msgbox')).toBe(false);
        expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    });

    it('rejects scheme-confusing inputs', () => {
        expect(isSafeHttpUrl('//evil.example')).toBe(false);
        expect(isSafeHttpUrl('java\tscript:alert(1)')).toBe(false);
        expect(isSafeHttpUrl(' java\nscript:alert(1)')).toBe(false);
        expect(isSafeHttpUrl('javascript&colon;alert(1)')).toBe(false);
    });

    it('rejects empty and non-string input', () => {
        expect(isSafeHttpUrl('')).toBe(false);
        expect(isSafeHttpUrl(null)).toBe(false);
        expect(isSafeHttpUrl(undefined)).toBe(false);
        expect(isSafeHttpUrl(42)).toBe(false);
    });
});
