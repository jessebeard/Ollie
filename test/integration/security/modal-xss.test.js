import { describe, it, expect } from '../../../test/utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../../test/utils/pbt.js';
import fs from 'fs';

const mockDoc = {
    body: { appendChild: () => {} },
    createElement: (tag) => ({
        className: '',
        style: {},
        appendChild: () => {},
        querySelector: () => ({ focus: () => {}, onclick: () => {}, onkeydown: () => {} }),
        querySelectorAll: () => [],
        setAttribute: () => {}
    })
};

const modalManagerSrc = fs.readFileSync('./app/components/vault/components/modal-manager.js', 'utf8');
const createModalManager = new Function('document', `
    ${modalManagerSrc.replace('export class', 'class')}
    return ModalManager;
`);
const ModalManager = createModalManager(mockDoc);

describe('ModalManager XSS Prevention', () => {
    it('should not contain unescaped structural HTML in prompt', async () => {
        // We use Arbitrary.string to test general input, but we also include a specific attribute breakout payload
        const payloadGen = {
            generate: () => {
                const payloads = ['"><script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'test'];
                return payloads[Math.floor(Math.random() * payloads.length)];
            },
            shrink: () => []
        };

        await assertProperty([payloadGen, payloadGen], async (title, label) => {
            const manager = new ModalManager();
            let renderedHtml = '';
            manager.show = (modal) => { renderedHtml = modal.innerHTML; };
            manager.prompt(title, label);

            // XSS Check: if the input is structural, it should not be present raw in the output
            if (title.includes('<') || title.includes('"')) {
                if (renderedHtml.includes(title)) {
                    throw new Error("Found unescaped title payload: " + title);
                }
            }
            if (label.includes('<') || label.includes('"')) {
                if (renderedHtml.includes(label)) {
                    throw new Error("Found unescaped label payload: " + label);
                }
            }

            return true;
        }, 50);
    });

    it('should not contain unescaped structural HTML in confirm', async () => {
        const payloadGen = {
            generate: () => {
                const payloads = ['"><script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'test'];
                return payloads[Math.floor(Math.random() * payloads.length)];
            },
            shrink: () => []
        };

        await assertProperty([payloadGen], async (message) => {
            const manager = new ModalManager();
            let renderedHtml = '';
            manager.show = (modal) => { renderedHtml = modal.innerHTML; };
            manager.confirm(message);

            if (message.includes('<') || message.includes('"')) {
                if (renderedHtml.includes(message)) {
                    throw new Error("Found unescaped message payload: " + message);
                }
            }
            return true;
        }, 50);
    });

    it('should not contain unescaped structural HTML in showForm', async () => {
        const payloadGen = {
            generate: () => {
                const payloads = ['"><script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'test'];
                return payloads[Math.floor(Math.random() * payloads.length)];
            },
            shrink: () => []
        };

        await assertProperty([payloadGen, payloadGen, payloadGen], async (title, label, val) => {
            const manager = new ModalManager();
            let renderedHtml = '';
            manager.show = (modal) => { renderedHtml = modal.innerHTML; };

            manager.showForm(title, [{ name: 'test', label: label, type: 'text' }], { test: val });

            if (title.includes('<') || title.includes('"')) {
                if (renderedHtml.includes(title)) throw new Error("Found unescaped title");
            }
            if (label.includes('<') || label.includes('"')) {
                if (renderedHtml.includes(label)) throw new Error("Found unescaped label");
            }
            if (val.includes('<') || val.includes('"')) {
                if (renderedHtml.includes(val)) throw new Error("Found unescaped value");
            }
            return true;
        }, 50);
    });

    it('should not contain unescaped structural HTML in showAlert', async () => {
        const payloadGen = {
            generate: () => {
                const payloads = ['"><script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'test'];
                return payloads[Math.floor(Math.random() * payloads.length)];
            },
            shrink: () => []
        };

        await assertProperty([payloadGen, payloadGen], async (title, message) => {
            const manager = new ModalManager();
            let renderedHtml = '';
            manager.show = (modal) => { renderedHtml = modal.innerHTML; };
            manager.showAlert(title, message);

            if (title.includes('<') || title.includes('"')) {
                if (renderedHtml.includes(title)) throw new Error("Found unescaped title");
            }
            if (message.includes('<') || message.includes('"')) {
                if (renderedHtml.includes(message)) throw new Error("Found unescaped message");
            }
            return true;
        }, 50);
    });
});
