import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalManagerSrc = fs.readFileSync(path.join(__dirname, '../../../app/components/vault/components/modal-manager.js'), 'utf8')
    .replace('export class ModalManager', 'class ModalManager');

describe('ModalManager XSS Vulnerability Tests', () => {
    it('Property: Modal title and message should be properly escaped', async () => {
        const dummyDocument = {
            createElement: (tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    className: '',
                    style: {},
                    children: [],
                    appendChild: (child) => el.children.push(child),
                    querySelector: () => ({ focus: () => {}, onclick: null }),
                    get innerHTML() { return this._innerHTML || ''; },
                    set innerHTML(val) { this._innerHTML = val; }
                };
                return el;
            },
            body: {
                appendChild: () => {}
            }
        };

        const env = new Function('document', `
            ${modalManagerSrc}
            return new ModalManager();
        `);

        await assertProperty(
            [
                Arbitrary.string(1, 50), // Title
                Arbitrary.string(1, 50)  // Message
            ],
            async (title, message) => {
                const manager = env(dummyDocument);

                let capturedHtml = '';
                manager.overlay.appendChild = (el) => {
                    capturedHtml = el.innerHTML;
                };

                const checkBreakout = (inputStr, containerHtml) => {
                    if ((inputStr.includes('<') || inputStr.includes('>') || inputStr.includes('"')) && containerHtml.includes(inputStr)) {
                        return true;
                    }
                    return false;
                };

                manager.confirm(message);
                if (checkBreakout(message, capturedHtml)) return false;

                manager.showAlert(title, message);
                if (checkBreakout(title, capturedHtml) || checkBreakout(message, capturedHtml)) return false;

                manager.prompt(title, message);
                if (checkBreakout(title, capturedHtml) || checkBreakout(message, capturedHtml)) return false;

                return true;
            }
        );
    });
});
