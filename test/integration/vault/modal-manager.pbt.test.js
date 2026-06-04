import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';

const componentPath = path.resolve(process.cwd(), 'app/components/vault/components/modal-manager.js');
let source = fs.readFileSync(componentPath, 'utf8');
source = source.replace(/export class ModalManager/g, 'class ModalManager');
source += '\nreturn ModalManager;';
const ModalManager = new Function(source)();

describe('ModalManager XSS Property-Based Tests', () => {
    it('should correctly escape inputs in showForm', async () => {
        if (typeof document === 'undefined') {
            globalThis.document = {
                body: { appendChild: () => {} },
                createElement: (tag) => {
                    return {
                        tagName: tag,
                        className: '',
                        style: {},
                        innerHTML: '',
                        querySelector: () => ({ focus: () => {}, onclick: () => {}, onkeydown: () => {}, onsubmit: () => {} })
                    };
                }
            };
        }

        const maliciousStringsArb = Arbitrary.string();

        await assertProperty([maliciousStringsArb, maliciousStringsArb, maliciousStringsArb], async (title, label, val) => {
            const manager = new ModalManager();
            let capturedHtml = '';
            manager.overlay = {
                appendChild: (el) => {
                    capturedHtml = el.innerHTML;
                },
                style: {}
            };

            const fields = [{name: 'field1', label: label}];
            manager.showForm(title, fields, {field1: val});

            if (val.includes('"') && capturedHtml.includes(`value="${val}"`)) {
                return false;
            }
            if (val.includes('<') && capturedHtml.includes(`<label>${val}</label>`)) {
                return false;
            }
            return true;
        }, 100);
    });
});
