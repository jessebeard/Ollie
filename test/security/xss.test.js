import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS Property Tests', () => {
    const setupMockDoc = () => {
        const originalDocument = global.document;
        global.document = {
            body: { appendChild: () => {} },
            createElement: (tag) => {
                const el = {
                    className: '', style: {}, appendChild: () => {},
                    querySelector: () => ({ focus: () => {}, onclick: () => {}, onkeydown: () => {}, onsubmit: () => {} }),
                    querySelectorAll: () => []
                };
                let innerHTMLValue = '';
                Object.defineProperty(el, 'innerHTML', {
                    get: () => innerHTMLValue,
                    set: (val) => { innerHTMLValue = val; }
                });
                return el;
            }
        };
        return originalDocument;
    };

    it('Property: prompt title and label never inject unescaped tags', async () => {
        const origDoc = setupMockDoc();
        const manager = new ModalManager();
        await assertProperty(
            [Arbitrary.string(1, 50), Arbitrary.string(1, 50)],
            async (title, label) => {
                let capturedHTML = '';
                manager.overlay.appendChild = (el) => { capturedHTML = el.innerHTML; };
                manager.prompt(title, label);
                if (title.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(title)) return false;
                if (label.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(label)) return false;
                return true;
            }
        );
        global.document = origDoc;
    });

    it('Property: confirm message never inject unescaped tags', async () => {
        const origDoc = setupMockDoc();
        const manager = new ModalManager();
        await assertProperty(
            [Arbitrary.string(1, 50)],
            async (message) => {
                let capturedHTML = '';
                manager.overlay.appendChild = (el) => { capturedHTML = el.innerHTML; };
                manager.confirm(message);
                if (message.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(message)) return false;
                return true;
            }
        );
        global.document = origDoc;
    });

    it('Property: showForm inputs never inject unescaped tags', async () => {
        const origDoc = setupMockDoc();
        const manager = new ModalManager();
        await assertProperty(
            [Arbitrary.string(1, 50), Arbitrary.string(1, 50), Arbitrary.string(1, 50)],
            async (title, fieldName, fieldLabel) => {
                let capturedHTML = '';
                manager.overlay.appendChild = (el) => { capturedHTML = el.innerHTML; };
                manager.showForm(title, [{ name: fieldName, label: fieldLabel }]);
                if (title.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(title)) return false;
                if (fieldName.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(fieldName)) return false;
                if (fieldLabel.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(fieldLabel)) return false;
                return true;
            }
        );
        global.document = origDoc;
    });

    it('Property: showAlert inputs never inject unescaped tags', async () => {
        const origDoc = setupMockDoc();
        const manager = new ModalManager();
        await assertProperty(
            [Arbitrary.string(1, 50), Arbitrary.string(1, 50)],
            async (title, message) => {
                let capturedHTML = '';
                manager.overlay.appendChild = (el) => { capturedHTML = el.innerHTML; };
                manager.showAlert(title, message);
                if (title.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(title)) return false;
                if (message.includes('<') && !capturedHTML.includes('&lt;') && capturedHTML.includes(message)) return false;
                return true;
            }
        );
        global.document = origDoc;
    });
});
