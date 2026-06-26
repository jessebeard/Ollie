import { describe, it, expect } from '../utils/test-runner.js';
import { sanitizeUrl } from '../../src/utils/sanitize-url.js';

describe('URL Sanitization', () => {
    it('should reject javascript: URLs', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('');
        expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
        expect(sanitizeUrl(' javascript:alert(1)')).toBe('');
        expect(sanitizeUrl('java\x00script:alert(1)')).toBe('');
    });

    it('should reject data: and vbscript: URLs', () => {
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
        expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    });

    it('should allow safe URLs', () => {
        expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
    });

    it('should allow safe schemeless URLs', () => {
        expect(sanitizeUrl('example.com')).toBe('example.com');
        expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
    });
});
