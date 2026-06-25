import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import * as fs from 'fs';
import * as path from 'path';

const isNode = typeof process !== 'undefined' && process.release.name === 'node';

describe('VaultView URL Sanitization', () => {
    it('prevents XSS via malicious URL protocols', async () => {
        let VaultView;
        if (isNode) {
            const { VaultView: VV } = await import('../../app/components/vault/components/vault-view.js');
            VaultView = VV;
        } else {
            return;
        }

        const view = new VaultView(null, null);

        const badUrls = [
            'javascript:alert(1)',
            ' javascript:alert(1)',
            '\tjavascript:alert(1)',
            '\njavascript:alert(1)',
            'jAvAsCrIpT:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'vbscript:msgbox(1)'
        ];

        for (const bad of badUrls) {
            expect(view.sanitizeUrl(bad)).toBe('');
        }

        const goodUrls = [
            'https://example.com',
            'http://example.com/path?q=1',
            'example.com',
            '/local/path',
            'mailto:test@test.com'
        ];

        for (const good of goodUrls) {
            expect(view.sanitizeUrl(good)).toBe(good.replace(/[\x00-\x1F\x7F]/g, ''));
        }

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const sanitized = view.sanitizeUrl(str);
                if (sanitized === '') return true;
                const lower = sanitized.toLowerCase().trim();
                return !lower.startsWith('javascript:') &&
                       !lower.startsWith('data:') &&
                       !lower.startsWith('vbscript:');
            }
        );
    });
});
