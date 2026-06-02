import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';

describe('Vault HTML Escaping', () => {

    it('VaultView escape should handle edge cases and properly escape attributes', () => {
        const vaultViewSrc = fs.readFileSync('app/components/vault/components/vault-view.js', 'utf-8');
        const VaultViewStr = vaultViewSrc.replace(/export class VaultView/, 'class VaultView');
        const getVaultView = new Function(`
            ${VaultViewStr}
            return VaultView;
        `);
        const VaultView = getVaultView();
        const view = new VaultView(null, null);

        // Edge cases
        expect(view.escape(0)).toBe('0');
        expect(view.escape(false)).toBe('false');
        expect(view.escape(null)).toBe('');
        expect(view.escape(undefined)).toBe('');

        // Attribute breakout vectors
        expect(view.escape('string with "quotes" and \'single quotes\'')).toBe('string with &quot;quotes&quot; and &#39;single quotes&#39;');
        expect(view.escape('"><script>alert(1)</script>')).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('VaultUI escapeHtml should handle edge cases and properly escape attributes', () => {
        const vaultSrc = fs.readFileSync('app/vault.js', 'utf-8');
        const match = vaultSrc.match(/escapeHtml\([^\)]+\)\s*{[^}]+}/);

        const getEscape = new Function(`
            return function ${match[0]}
        `);
        const escapeHtml = getEscape();

        // Attribute breakout vectors
        expect(escapeHtml('string with "quotes" and \'single quotes\'')).toBe('string with &quot;quotes&quot; and &#39;single quotes&#39;');
        expect(escapeHtml('"><script>alert(1)</script>')).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');

        // Edge cases
        expect(escapeHtml(0)).toBe('0');
        expect(escapeHtml(false)).toBe('false');
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('VaultUI HTML Context Breakout Prevention (PBT)', async () => {
        const vaultSrc = fs.readFileSync('app/vault.js', 'utf-8');
        const match = vaultSrc.match(/escapeHtml\([^\)]+\)\s*{[^}]+}/);

        const getEscape = new Function(`
            return function ${match[0]}
        `);
        const escapeHtml = getEscape();

        // PBT to verify that XSS payloads cannot break out of structural context
        const stringArb = {
            generate: () => {
                const str = Arbitrary.string(0, 100).generate();
                return str + '"><script>alert(1)</script>' + "' onmouseover='alert(1)'";
            },
            shrink: (value) => [value.substring(0, value.length - 1)]
        };

        await assertProperty([stringArb], (str) => {
            const escaped = escapeHtml(str);
            // Instead of checking for arbitrary string contents (which might naturally contain text),
            // check for successful tag breakout.
            return !escaped.includes('><script>') && !escaped.includes("' onmouseover=");
        }, 100);
    });
});
