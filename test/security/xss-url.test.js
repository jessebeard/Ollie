import { it, describe, expect } from '../utils/test-runner.js';
import { sanitizeUrl } from '../../app/components/vault/components/url-sanitizer.js';

describe('URL Sanitizer', () => {
    it('should sanitize javascript and vbscript urls', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl(' javascript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('java script:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('javascript :alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('about:blank');
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank');
    });

    it('should allow http and https urls', () => {
        expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(sanitizeUrl('https://example.com/foo%20bar')).toBe('https://example.com/foo%20bar');
    });

    it('should not break legitimate urls with unescaped spaces', () => {
        expect(sanitizeUrl('https://example.com/foo bar')).toBe('https://example.com/foo bar');
    });

    it('should allow mailto and tel', () => {
        expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
        expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
    });

    it('should allow schemeless urls', () => {
        expect(sanitizeUrl('example.com')).toBe('example.com');
    });

    it('should correctly strip null bytes', () => {
        expect(sanitizeUrl('\x00javascript:alert(1)')).toBe('about:blank');
    });
});
