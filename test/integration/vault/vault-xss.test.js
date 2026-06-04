import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultJsContent = fs.readFileSync(path.join(__dirname, '../../../app/vault.js'), 'utf8');

const escapeHtmlMatch = vaultJsContent.match(/escapeHtml\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*{([^}]+)}/);
let escapeHtmlFn = () => {};
if (escapeHtmlMatch) {
    escapeHtmlFn = new Function(escapeHtmlMatch[1], escapeHtmlMatch[2]);
}

describe('Vault UI XSS Prevention (PBT)', () => {
    it('escapes all HTML special characters in VaultView', async () => {
        const view = new VaultView(null, null);

        const xssVectorArb = {
            generate: () => {
                const vectors = [
                    '"><script>alert(1)</script>',
                    '" onfocus="alert(1)"',
                    '\' onfocus=\'alert(1)\'',
                    0, false, null, undefined
                ];
                return vectors[Math.floor(Math.random() * vectors.length)] + Math.random().toString(36);
            },
            shrink: (v) => v
        };

        await assertProperty([xssVectorArb], (payload) => {
            let escaped;
            try { escaped = view.escape(payload); }
            catch (e) { return false; }

            if (escaped == null) return payload == null;
            if (escaped.includes('<') || escaped.includes('>') || escaped.includes('"') || escaped.includes("'")) return false;

            if (payload === 0 && escaped !== '0') return false;
            if (payload === false && escaped !== 'false') return false;

            return true;
        }, 100);
    });

    it('escapes all HTML special characters in legacy vault.js', async () => {
        global.document = {
            createElement: () => ({
                set textContent(val) { this.val = val; },
                get innerHTML() { return this.val ? String(this.val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }
            })
        };

        const xssVectorArb = {
            generate: () => {
                const chars = ['<', '>', '"', '\'', '&', 'a', '1', ' '];
                let s = '';
                const len = Math.floor(Math.random() * 20);
                for(let i=0; i<len; i++) s += chars[Math.floor(Math.random()*chars.length)];

                const vectors = [
                    s,
                    '"><script>alert(1)</script>',
                    '" onfocus="alert(1)"',
                    '\' onfocus=\'alert(1)\'',
                    0, false, null, undefined
                ];
                return vectors[Math.floor(Math.random() * vectors.length)];
            },
            shrink: (v) => v
        };

        await assertProperty([xssVectorArb], (payload) => {
            let escaped;
            try { escaped = escapeHtmlFn.call({ escapeHtml: escapeHtmlFn }, payload); }
            catch (e) { return false; }

            if (escaped === '') return payload == null || payload === '';
            if (escaped.includes('<') || escaped.includes('>') || escaped.includes('"') || escaped.includes("'")) return false;
            return true;
        }, 100);
    });
});
