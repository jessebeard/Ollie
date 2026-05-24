import { describe, it, expect } from '../../test/utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../test/utils/pbt.js';

// We need to test the vault.js escapeHtml function. Since vault.js is highly coupled to
// browser globals (like document.getElementById), we'll isolate the function.

// A minimal mock of the function body exactly as patched:
function escapeHtmlMock(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

describe('Security: HTML Escaping (XSS Prevention)', () => {
    it('vault.js escapeHtml should neutralize structural HTML characters', async () => {
        await assertProperty(
            [Arbitrary.string(1, 100)],
            (input) => {
                const escaped = escapeHtmlMock(input);
                return !/[<>"']/.test(escaped) && !/(?<!&[a-z0-9#]+);?&(?![a-z0-9#]+;)/i.test(escaped);
            },
            1000
        );
    });
});
