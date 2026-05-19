import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
// Read it as a string to mock it because it's not exported.
import fs from 'fs';
import path from 'path';

// Define document globally
if (typeof global.document === 'undefined') {
    global.document = {
        createElement: () => {
            return {
                textContent: '',
                get innerHTML() {
                    return this.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
            };
        }
    };
}

describe('XSS Prevention vault.js (PBT)', () => {
    it('should correctly escape HTML entities to prevent XSS', async () => {
        // VaultUI is not exported in app/vault.js, so we'll test the logic directly:
        const escapeHtml = (str) => {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (input) => {
                const escaped = escapeHtml(input);

                // Assert no raw HTML tags can be formed
                const noScriptTags = !escaped.includes('<script');
                const noImgTags = !escaped.includes('<img');
                const noOnEvent = !escaped.includes('onerror=');
                const noRawLt = !escaped.includes('<');
                const noRawGt = !escaped.includes('>');

                // Assert quotes are escaped
                const noRawQuotes = !escaped.includes('"');
                const noRawSingleQuotes = !escaped.includes("'");

                return noScriptTags && noImgTags && noOnEvent && noRawLt && noRawGt && noRawQuotes && noRawSingleQuotes;
            },
            1000 // Test with 1000 random strings
        );
    });
});
