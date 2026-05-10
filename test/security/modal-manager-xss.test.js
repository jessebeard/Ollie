import { describe, it, expect } from '../../test/utils/test-runner.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager Security (XSS)', () => {
    it('escapes HTML in prompt title and label', async () => {
        // Setup minimal DOM
        const env = typeof global !== 'undefined' ? global : window;
        if (!env.document) {
             // Mock document if needed
        }

        const manager = new ModalManager();
        let appendedModal = null;
        manager.overlay.appendChild = (el) => { appendedModal = el; };

        manager.prompt('<script>alert(1)</script>', '<b>Label</b>');

        expect(appendedModal).not.toBeNull();
        expect(appendedModal.innerHTML).not.toContain('<script>');
        expect(appendedModal.innerHTML).not.toContain('<b>');
    });
});
