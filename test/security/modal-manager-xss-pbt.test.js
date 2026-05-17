import { describe, it, expect } from '../utils/test-runner.js';
import fs from 'fs';
import path from 'path';

// Mock DOM
const MOCK_DOM = `
    const document = {
        body: { appendChild: () => {} },
        createElement: (tag) => {
            return {
                className: '',
                style: {},
                _innerHTML: '',
                get innerHTML() { return this._innerHTML; },
                set innerHTML(val) { this._innerHTML = val; },
                appendChild: () => {},
                querySelector: () => { return { focus: () => {}, onclick: null, onkeydown: null, value: '' }; }
            };
        }
    };
    const window = { setTimeout: (fn) => fn() };
`;

// Read ModalManager source
const srcPath = path.resolve(process.cwd(), 'app/components/vault/components/modal-manager.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Strip export
src = src.replace('export class ModalManager', 'class ModalManager');

// Eval to create ModalManager class
const evalSrc = `
    ${MOCK_DOM}
    ${src}
    ModalManager;
`;

const ModalManager = eval(evalSrc);

describe('ModalManager PBT Security', () => {
    it('should escape malicious characters in prompt, confirm, showForm, showAlert', () => {
        const manager = new ModalManager();
        let capturedModal = null;
        manager.overlay.appendChild = (el) => { capturedModal = el; };

        const maliciousPayloads = [
            '<script>alert(1)</script>',
            '"><img src=x onerror=alert(1)>',
            '" onfocus="alert(1)"',
            '&lt;script&gt;',
            '\'',
            '"',
            '<',
            '>',
            '&'
        ];

        for (const payload of maliciousPayloads) {
            // Test prompt
            manager.prompt(payload, payload);
            expect(capturedModal).not.toBeNull();
            if (capturedModal.innerHTML.includes('<script')) {
                 throw new Error(`XSS Vulnerability found in prompt with payload: ${payload}`);
            }

            // Test confirm
            manager.confirm(payload);
            expect(capturedModal).not.toBeNull();
            if (capturedModal.innerHTML.includes('<script')) {
                 throw new Error(`XSS Vulnerability found in confirm with payload: ${payload}`);
            }

            // Test showForm
            manager.showForm(payload, [{name: payload, label: payload}]);
            expect(capturedModal).not.toBeNull();
            if (capturedModal.innerHTML.includes('<script')) {
                 throw new Error(`XSS Vulnerability found in showForm with payload: ${payload}`);
            }

            // Test showAlert
            manager.showAlert(payload, payload);
            expect(capturedModal).not.toBeNull();
            if (capturedModal.innerHTML.includes('<script')) {
                 throw new Error(`XSS Vulnerability found in showAlert with payload: ${payload}`);
            }
        }
    });
});
