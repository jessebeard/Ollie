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

import { ModalManager } from '../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS Prevention', () => {
    it('should correctly escape HTML characters in ModalManager', async () => {
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
