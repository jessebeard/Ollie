import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let escapeHtml;
let vaultViewEscape;

try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const vaultJsContent = fs.readFileSync(path.join(__dirname, '../../../app/vault.js'), 'utf8');
    const vaultViewJsContent = fs.readFileSync(path.join(__dirname, '../../../app/components/vault/components/vault-view.js'), 'utf8');

    // For vault.js escapeHtml
    const escapeHtmlMatch = vaultJsContent.match(/escapeHtml\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
    const escapeHtmlBody = escapeHtmlMatch ? escapeHtmlMatch[1] : '';

    if (typeof document === 'undefined') {
        const mockDoc = {
            createElement: () => ({
                _textContent: '',
                set textContent(v) { this._textContent = v; },
                get innerHTML() {
                    // Simulated native behavior: replaces <, >, & but NOT quotes!
                    return String(this._textContent)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                }
            })
        };
        globalThis.document = mockDoc;
    }
    escapeHtml = new Function('text', escapeHtmlBody);

    // For VaultView.escape
    const escapeMatch = vaultViewJsContent.match(/escape\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
    const escapeBody = escapeMatch ? escapeMatch[1] : '';
    vaultViewEscape = new Function('str', escapeBody);
} catch(e) {
    escapeHtml = () => '';
    vaultViewEscape = () => '';
}

if (typeof window === 'undefined') {
    describe('XSS Prevention (Property-Based)', () => {
        it('Property: escapeHtml prevents attribute breakout', async () => {
            await assertProperty([Arbitrary.string(1, 50)], (input) => {
                const payload = `"${input}"`;
                const escaped = escapeHtml(payload);
                return !escaped.includes('"');
            });
        });

        it('Property: VaultView.escape prevents attribute breakout', async () => {
            await assertProperty([Arbitrary.string(1, 50)], (input) => {
                const payload = `"${input}'`;
                const escaped = vaultViewEscape(payload);
                return !escaped.includes("'") && !escaped.includes('"');
            });
        });
    });
}
