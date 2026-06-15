import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { ModalManager } from '../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS Prevention', () => {
    it('should correctly escape title and message in alerts', async () => {
        // mock document
        const div = { innerHTML: '', style: {} };
        const documentMock = {
            createElement: () => ({ ...div, querySelector: () => ({ onclick: null, focus: () => {} }), appendChild: () => {} }),
            body: { appendChild: () => {} }
        };
        globalThis.document = documentMock;

        const manager = new ModalManager();

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = manager.escape(str);
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(manager.escape(123)).toBe("123");
        expect(manager.escape(true)).toBe("true");
        expect(manager.escape(null)).toBe("");
        expect(manager.escape(undefined)).toBe("");
        expect(manager.escape(0)).toBe("0");
        expect(manager.escape(false)).toBe("false");
    });
});
