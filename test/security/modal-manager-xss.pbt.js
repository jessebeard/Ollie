import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager Security', () => {
    it('should escape HTML in prompt dialog', async () => {
        await assertProperty(
            [Arbitrary.string(), Arbitrary.string()],
            async (title, label) => {
                const manager = new ModalManager();
                let injectedHTML = '';
                manager.overlay.appendChild = (modal) => {
                    injectedHTML = modal.innerHTML;
                };

                manager.prompt(title, label, 'text');

                if (title && /[<>"'&]/.test(title)) {
                    expect(injectedHTML).not.toContain(`<h3>${title}</h3>`);
                }

                if (label && /[<>"'&]/.test(label)) {
                    expect(injectedHTML).not.toContain(`<label>${label}</label>`);
                }

                return true;
            },
            100
        );
    });

    it('should escape HTML in confirm dialog', async () => {
        await assertProperty(
            [Arbitrary.string()],
            async (message) => {
                const manager = new ModalManager();
                let injectedHTML = '';
                manager.overlay.appendChild = (modal) => {
                    injectedHTML = modal.innerHTML;
                };

                manager.confirm(message);

                if (message && /[<>"'&]/.test(message)) {
                    expect(injectedHTML).not.toContain(`<p>${message}</p>`);
                }
                return true;
            },
            100
        );
    });

    it('should escape HTML in alert dialog', async () => {
        await assertProperty(
            [Arbitrary.string(), Arbitrary.string()],
            async (title, message) => {
                const manager = new ModalManager();
                let injectedHTML = '';
                manager.overlay.appendChild = (modal) => {
                    injectedHTML = modal.innerHTML;
                };

                manager.showAlert(title, message, 'info');

                if (title && /[<>"'&]/.test(title)) {
                    expect(injectedHTML).not.toContain(`<h3>${title}</h3>`);
                }

                if (message && /[<>"'&]/.test(message)) {
                    expect(injectedHTML).not.toContain(`<p style="text-align: center; color: var(--text-muted);">${message}</p>`);
                }

                return true;
            },
            100
        );
    });

    it('should escape HTML in form dialog', async () => {
        await assertProperty(
            [Arbitrary.string(), Arbitrary.string(), Arbitrary.string()],
            async (title, fieldName, fieldLabel) => {
                const manager = new ModalManager();
                let injectedHTML = '';
                manager.overlay.appendChild = (modal) => {
                    injectedHTML = modal.innerHTML;
                };

                manager.showForm(title, [{ name: fieldName, label: fieldLabel, type: 'text' }]);

                if (title && /[<>"'&]/.test(title)) {
                    expect(injectedHTML).not.toContain(`<h3>${title}</h3>`);
                }

                if (fieldLabel && /[<>"'&]/.test(fieldLabel)) {
                    expect(injectedHTML).not.toContain(`<label>${fieldLabel}</label>`);
                }

                return true;
            },
            50
        );
    });
});
