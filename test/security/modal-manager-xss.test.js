import { describe, it, expect } from '../../test/utils/test-runner.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager Security', () => {
    it('should escape HTML in prompt, confirm, and showAlert messages', async () => {
        const manager = new ModalManager();
        const payload = '<img src=x onerror=alert(1)>';

        let promptModal;

        // Mock show to intercept the modal and inspect its innerHTML
        const originalShow = manager.show;
        manager.show = function(modal) {
            promptModal = modal;
        };

        // Test prompt
        manager.prompt(payload, payload);
        expect(promptModal.innerHTML.includes(payload)).toBe(false);
        expect(promptModal.innerHTML.includes('&lt;img')).toBe(true);

        // Test confirm
        manager.confirm(payload);
        expect(promptModal.innerHTML.includes(payload)).toBe(false);
        expect(promptModal.innerHTML.includes('&lt;img')).toBe(true);

        // Test showAlert
        manager.showAlert(payload, payload);
        expect(promptModal.innerHTML.includes(payload)).toBe(false);
        expect(promptModal.innerHTML.includes('&lt;img')).toBe(true);
    });
});
