import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

describe('Vault XSS Prevention (Property-Based Tests)', () => {
    it('Property: VaultView.escape() prevents HTML and attribute injection', async () => {
        const view = new VaultView(null, null);

        const arbPayload = () => ({
            generate: () => {
                const base = Arbitrary.string(1, 10).generate();
                const payloads = [
                    '<script>alert(1)</script>',
                    '"><img src=x onerror=alert(1)>',
                    '\' onfocus="alert(1)"',
                    '&lt;script&gt;',
                    'javascript:alert(1)',
                    '<svg/onload=alert(1)>'
                ];
                if (Math.random() > 0.3) {
                     return base + payloads[Math.floor(Math.random() * payloads.length)] + base;
                }
                return base;
            },
            shrink: () => []
        });

        const arbMixedType = () => ({
            generate: () => {
                const rand = Math.random();
                if (rand < 0.2) return Math.floor(Math.random() * 1000);
                if (rand < 0.4) return Math.random() > 0.5;
                if (rand < 0.6) return null;
                if (rand < 0.8) return undefined;
                return arbPayload().generate();
            },
            shrink: () => []
        });

        await assertProperty(
            [arbMixedType()],
            async (input) => {
                const escaped = view.escape(input);

                expect(typeof escaped).toBe('string');

                if (input != null) {
                    const strInput = String(input);
                    if (strInput.includes('<')) expect(escaped.includes('<')).toBe(false);
                    if (strInput.includes('>')) expect(escaped.includes('>')).toBe(false);
                    if (strInput.includes('"')) expect(escaped.includes('"')).toBe(false);
                    if (strInput.includes("'")) expect(escaped.includes("'")).toBe(false);
                }
                return true;
            },
            100
        );
    });

    it('Property: VaultUI escapeHtml prevents HTML and attribute injection', async () => {
        if (!isNode) {
            expect(true).toBe(true);
            return;
        }

        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const vaultJsContent = fs.readFileSync(path.join(__dirname, '../../../app/vault.js'), 'utf8');
        const match = vaultJsContent.match(/escapeHtml\s*\([^)]*\)\s*{([^}]+)}/);

        let escapeHtmlFn;
        if (match) {
            escapeHtmlFn = new Function('text', match[1]);
        }

        if (!escapeHtmlFn) {
            throw new Error("Could not extract escapeHtml function from vault.js");
        }

        const arbMaliciousString = () => ({
            generate: () => {
                const payloads = [
                    '<script>alert(1)</script>',
                    '"><img src=x onerror=alert(1)>',
                    '\' onfocus="alert(1)"',
                    '&lt;script&gt;'
                ];
                return payloads[Math.floor(Math.random() * payloads.length)];
            },
            shrink: () => []
        });

        await assertProperty(
            [arbMaliciousString()],
            async (input) => {
                const escaped = escapeHtmlFn(input);

                if (input.includes('<')) expect(escaped.includes('<')).toBe(false);
                if (input.includes('>')) expect(escaped.includes('>')).toBe(false);
                if (input.includes('"')) expect(escaped.includes('"')).toBe(false);
                if (input.includes("'")) expect(escaped.includes("'")).toBe(false);

                return true;
            },
            50
        );
    });
});
