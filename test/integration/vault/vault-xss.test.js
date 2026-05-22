import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';

describe('Vault XSS Prevention (Property-Based Tests)', () => {

    it('Property: VaultView.escape() neutralizes XSS vectors', () => {
        // Read file contents dynamically because module loading is hard in this environment without full dom
        const content = fs.readFileSync('./app/components/vault/components/vault-view.js', 'utf8');

        // Extract just the escape method logic
        const escapeMethodStr = content.match(/escape\(str\)\s*\{([\s\S]*?)\n\s*\}/)[1];
        const escape = new Function('str', escapeMethodStr);

        // Advanced string arbitrary to generate XSS vectors
        const xssArbitrary = () => {
            const baseStrings = Arbitrary.string()();
            const vectors = [
                "<script>alert(1)</script>",
                "\" onmouseover=\"alert(1)\"",
                "' onfocus='alert(1)'",
                "javascript:alert(1)",
                "<img src=x onerror=alert(1)>",
                "&lt;script&gt;",
                "0", "false", "", null, undefined
            ];
            // 50% random string, 50% targeted vector
            return Math.random() > 0.5 ? baseStrings : vectors[Math.floor(Math.random() * vectors.length)];
        };

        assertProperty([xssArbitrary], (input) => {
            const escaped = escape(input);
            if (input == null) {
                expect(escaped).toBe('');
                return;
            }
            // If the input was something like '0' or 'false', it should NOT be empty string!
            if (input === 0 || input === false) {
                 expect(escaped).not.toBe('');
            }

            // Should not contain raw tags or unescaped quotes
            if (typeof input === 'string') {
                 expect(escaped.includes('<script')).toBe(false);
                 // We assert that the original quote character is NOT present
                 // as long as the input actually contained one of these vectors
                 if (input.includes('onmouseover')) {
                     expect(escaped.includes('onmouseover="')).toBe(false);
                 }
                 expect(escaped.includes("'")).toBe(false);
                 expect(escaped.includes('"')).toBe(false);
            }
        });
    });

    it('Property: Vault.escapeHtml() neutralizes XSS vectors', () => {
        const content = fs.readFileSync('./app/vault.js', 'utf8');
        const escapeMethodStr = content.match(/escapeHtml\(text\)\s*\{([\s\S]*?)\n\s*\}/)[1];
        const escapeHtml = new Function('text', `
            ${escapeMethodStr}
        `);

        const xssArbitrary = () => {
            const vectors = [
                "\" onmouseover=\"alert(1)\"",
                "' onfocus='alert(1)'",
                "<img src=x onerror=alert(1)>"
            ];
            return vectors[Math.floor(Math.random() * vectors.length)];
        };

        assertProperty([xssArbitrary], (input) => {
            const escaped = escapeHtml(input);
            if (input && typeof input === 'string') {
                expect(escaped.includes("'")).toBe(false);
                expect(escaped.includes('"')).toBe(false);
            }
        });
    });
});
