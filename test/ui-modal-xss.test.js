import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { ModalManager } from '../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS Prevention', () => {
    it('should correctly escape HTML characters to prevent XSS in modals', async () => {
        const modalManager = new ModalManager();

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = modalManager.escape(str);
                // The escaped string should not contain unescaped structural characters
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(modalManager.escape(123)).toBe("123");
        expect(modalManager.escape(true)).toBe("true");
        expect(modalManager.escape(null)).toBe("");
        expect(modalManager.escape(undefined)).toBe("");
        expect(modalManager.escape(0)).toBe("0");
        expect(modalManager.escape(false)).toBe("false");
    });
});
