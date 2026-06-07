import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('VaultUI XSS Prevention Property-Based Test', () => {
    it('Property: VaultUI escapes structural HTML characters to prevent XSS payloads', async () => {
        const uiCode = fs.readFileSync(path.join(__dirname, '../../../app/vault.js'), 'utf8');
        const match = uiCode.match(/escapeHtml\(text\)\s*{([\s\S]*?)\n    }/);
        const funcBody = match[1];

        const vaultEscapeHtml = function(text) {
            return new Function('text', funcBody)(text);
        };

        const vaultView = new VaultView(null, null);
        const vaultViewEscape = vaultView.escape.bind(vaultView);

        const arbMaliciousInput = {
            generate: () => {
                const chars = ['"', "'", '<', '>', '&', 'a', '1', ' ', '=', '/'];
                let res = '';
                for(let i=0; i<20; i++) res += chars[Math.floor(Math.random() * chars.length)];
                return res;
            },
            shrink: (v) => {
                if(v.length === 0) return [];
                return [v.slice(0, -1)];
            }
        };

        assertProperty(
            [arbMaliciousInput],
            (input) => {
                // Test vault.js
                const escaped1 = vaultEscapeHtml(input);
                const containsUnescapedQuotes1 = /["'<>]/.test(escaped1);
                expect(containsUnescapedQuotes1).toBe(false);

                // Test VaultView
                const escaped2 = vaultViewEscape(input);
                const containsUnescapedQuotes2 = /["'<>]/.test(escaped2);
                expect(containsUnescapedQuotes2).toBe(false);
            }
        );
    });
});
