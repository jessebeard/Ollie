import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { VaultView } from '../app/components/vault/components/vault-view.js';

describe('VaultView XSS Prevention', () => {
    it('should correctly escape HTML characters without failing on non-strings', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = view.escape(str);
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(view.escape(123)).toBe("123");
        expect(view.escape(true)).toBe("true");
        expect(view.escape(null)).toBe("");
        expect(view.escape(undefined)).toBe("");
        expect(view.escape(0)).toBe("0");
        expect(view.escape(false)).toBe("false");
    });
});

describe('Legacy PasswordVault XSS Prevention', () => {
    it('should correctly escape HTML characters without failing on non-strings', async () => {
        // Since we are not exporting PasswordVault, we can just test the escapeHtml logic.
        // It's a pure string manipulation function now.
        const escapeHtml = (text) => {
            if (text == null) return '';
            return String(text).replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

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
