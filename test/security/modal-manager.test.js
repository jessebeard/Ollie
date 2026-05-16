import { describe, it, expect } from '../utils/test-runner.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';
import fc from 'fast-check';

describe('ModalManager Security', () => {
    it('should escape HTML in prompt messages (PBT)', () => {
        const manager = new ModalManager();
        let appendedElement = null;
        manager.overlay.appendChild = (el) => { appendedElement = el; };

        fc.assert(
            fc.property(fc.string(), fc.string(), (title, label) => {
                manager.prompt(title, label);
                const html = appendedElement.innerHTML;

                // If the input has < or >, we expect those to be escaped in the output.
                // We should NOT find the literal unescaped strings in the output if they contain < or > or & or ".
                if (/[<>&"]/.test(title)) expect(html).not.toContain('<h3>' + title + '</h3>');
                if (/[<>&"]/.test(label)) expect(html).not.toContain('<label>' + label + '</label>');
            })
        );
    });

    it('should escape HTML in confirm messages (PBT)', () => {
        const manager = new ModalManager();
        let appendedElement = null;
        manager.overlay.appendChild = (el) => { appendedElement = el; };

        fc.assert(
            fc.property(fc.string(), (message) => {
                manager.confirm(message);
                const html = appendedElement.innerHTML;
                if (/[<>&"]/.test(message)) expect(html).not.toContain('<p>' + message + '</p>');
            })
        );
    });

    it('should escape HTML in showForm labels and titles (PBT)', () => {
        const manager = new ModalManager();
        let appendedElement = null;
        manager.overlay.appendChild = (el) => { appendedElement = el; };

        fc.assert(
            fc.property(fc.string(), fc.string(), fc.string(), (title, label, val) => {
                manager.showForm(title, [{ name: 'test', label: label }], { test: val });
                const html = appendedElement.innerHTML;
                if (/[<>&"]/.test(title)) expect(html).not.toContain('<h3>' + title + '</h3>');
                if (/[<>&"]/.test(label)) expect(html).not.toContain('<label>' + label + '</label>');
                if (/[<>&"]/.test(val)) {
                    expect(html).not.toContain('value="' + val + '"');
                    expect(html).not.toContain('>' + val + '</textarea>');
                }
            })
        );
    });

    it('should escape HTML in showAlert titles and messages (PBT)', () => {
        const manager = new ModalManager();
        let appendedElement = null;
        manager.overlay.appendChild = (el) => { appendedElement = el; };

        fc.assert(
            fc.property(fc.string(), fc.string(), (title, message) => {
                manager.showAlert(title, message);
                const html = appendedElement.innerHTML;
                if (/[<>&"]/.test(title)) expect(html).not.toContain('<h3>' + title + '</h3>');
                if (/[<>&"]/.test(message)) expect(html).not.toContain('<p style="text-align: center; color: var(--text-muted);">' + message + '</p>');
            })
        );
    });
});
