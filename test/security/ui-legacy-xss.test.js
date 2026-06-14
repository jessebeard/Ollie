import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import * as fs from 'fs';
import * as path from 'path';

const isNode = typeof process !== 'undefined' && process.release.name === 'node';

describe('Legacy VaultUI XSS Prevention', () => {
    it('should correctly escape HTML characters without failing on non-strings', async () => {
        // To test this pure function without loading the whole VaultUI class and DOM,
        // we extract its body if running in Node. In the browser, it would need VaultUI loaded,
        // but we'll use a dynamic evaluation for Node to avoid jsdom.
        let escapeHtmlFn;
        if (isNode) {
            const code = fs.readFileSync(path.join(process.cwd(), 'app/vault.js'), 'utf-8');
            const match = code.match(/escapeHtml\(text\)\s*{([^}]+)}/);
            if (!match) throw new Error("escapeHtml not found");
            escapeHtmlFn = new Function('text', match[1]);
        } else {
            return; // Skip in browser for now to avoid complexity, or implement a simple mock
        }

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = escapeHtmlFn(str);
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(escapeHtmlFn(123)).toBe("123");
        expect(escapeHtmlFn(true)).toBe("true");
        expect(escapeHtmlFn(null)).toBe("");
        expect(escapeHtmlFn(undefined)).toBe("");
        expect(escapeHtmlFn(0)).toBe("0");
        expect(escapeHtmlFn(false)).toBe("false");
    });
});
