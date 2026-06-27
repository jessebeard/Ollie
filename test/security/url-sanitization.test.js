import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import * as fs from 'fs';
import * as path from 'path';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Sanitization XSS Prevention', () => {
    it('should strip out javascript:, vbscript:, and data: URLs', () => {
        const view = new VaultView(null, null);

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl(' javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('\x00javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('vbscript:msgbox(1)')).toBe('');
        expect(view.sanitizeUrl('data:text/html,<h1>hi</h1>')).toBe('');

        expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(view.sanitizeUrl('example.com')).toBe('example.com');
        expect(view.sanitizeUrl('ftp://example.com')).toBe('ftp://example.com');

        expect(view.sanitizeUrl(null)).toBe('');
        expect(view.sanitizeUrl(undefined)).toBe('');
    });

    it('property: sanitized URL should never allow blocked protocols', async () => {
        const view = new VaultView(null, null);
        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const sanitized = view.sanitizeUrl(str);
                if (!sanitized) return true;

                try {
                    const parsed = new URL(sanitized, 'http://dummy.base');
                    const blocked = ['javascript:', 'data:', 'vbscript:'];
                    return !blocked.includes(parsed.protocol);
                } catch {
                    return true;
                }
            }
        );
    });
});
