import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultJsContent = fs.readFileSync(path.join(__dirname, '../app/vault.js'), 'utf8');

// Extract just the escapeHtml method to test in isolation
const escapeHtmlMatch = vaultJsContent.match(/escapeHtml\s*\([^)]*\)\s*{([^}]+)}/m);

describe('Legacy VaultUI XSS Prevention', () => {
    it('should correctly escape HTML characters without failing on non-strings', async () => {

        let escapeHtml;
        if (escapeHtmlMatch) {
            escapeHtml = new Function('text', escapeHtmlMatch[1]);
        } else {
            throw new Error("Could not extract escapeHtml method");
        }

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = escapeHtml(str);
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(escapeHtml(123)).toBe("123");
        expect(escapeHtml(true)).toBe("true");
        expect(escapeHtml(null)).toBe("");
        expect(escapeHtml(undefined)).toBe("");
        expect(escapeHtml(0)).toBe("0");
        expect(escapeHtml(false)).toBe("false");
    });
});
