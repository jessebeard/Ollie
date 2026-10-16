import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { escapeHtml } from '../../src/utils/escape-html.js';

describe('escapeHtml XSS Prevention', () => {
    it('escapes HTML-special characters without failing on non-strings', async () => {
        // The canonical escaping implementation lives in src/utils/escape-html.js
        // and is shared by every app component; testing it directly avoids the
        // brittle source-scraping this suite used before.
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

    it('neutralizes a full XSS payload', () => {
        const payload = '<img src=x onerror="alert(\'1\')">';
        const escaped = escapeHtml(payload);
        expect(escaped.includes('<')).toBe(false);
        expect(escaped.includes('>')).toBe(false);
        expect(escaped).toContain('&lt;');
    });

    it('Property: escaped string length is monotonically non-decreasing compared to unescaped length', async () => {
        await assertProperty(
            [Arbitrary.string(0, 100)],
            (str) => {
                const escaped = escapeHtml(str);
                expect(escaped.length).toBeGreaterThanOrEqual(str.length);
            },
            100
        );
    });

    it('Metamorphic MR: double-escape stability and containment', async () => {
        await assertProperty(
            [Arbitrary.string(0, 100)],
            (str) => {
                const once = escapeHtml(str);
                const twice = escapeHtml(once);

                // Both once and twice must be completely sanitized of raw HTML delims
                expect(once.includes('<')).toBe(false);
                expect(once.includes('>')).toBe(false);
                expect(once.includes('"')).toBe(false);
                expect(once.includes("'")).toBe(false);

                expect(twice.includes('<')).toBe(false);
                expect(twice.includes('>')).toBe(false);
                expect(twice.includes('"')).toBe(false);
                expect(twice.includes("'")).toBe(false);

                // Second escape expands &amp; into &amp;amp; so length(twice) >= length(once)
                expect(twice.length).toBeGreaterThanOrEqual(once.length);
            },
            100
        );
    });
});
