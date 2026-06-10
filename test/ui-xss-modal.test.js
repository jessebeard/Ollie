import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { JSDOM } from 'jsdom';

describe('ModalManager XSS Prevention', () => {
    it('should correctly escape HTML characters without failing on non-strings', async () => {
        const dom = new JSDOM();
        const document = dom.window.document;
        globalThis.document = document;

        const { ModalManager } = await import('../app/components/vault/components/modal-manager.js');
        const modal = new ModalManager();

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = modal.escape(str);
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(modal.escape(123)).toBe("123");
        expect(modal.escape(true)).toBe("true");
        expect(modal.escape(null)).toBe("");
        expect(modal.escape(undefined)).toBe("");
        expect(modal.escape(0)).toBe("0");
        expect(modal.escape(false)).toBe("false");
    });
});
