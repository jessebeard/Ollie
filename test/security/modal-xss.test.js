import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock document for ModalManager
if (typeof window === 'undefined') {
    global.document = {
        createElement: (tag) => {
            return {
                tagName: tag.toUpperCase(),
                style: {},
                innerHTML: '',
                querySelector: () => ({ focus: () => {}, value: '', onclick: () => {}, onkeydown: () => {} }),
                querySelectorAll: () => [],
                appendChild: () => {},
            };
        },
        body: {
            appendChild: () => {}
        }
    };
}

import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS Vulnerability Tests', () => {
    it('should escape HTML in prompt method', async () => {
        const manager = new ModalManager();
        manager.overlay.appendChild = (modal) => {
            manager.lastModal = modal;
        };

        const testProperty = async (maliciousInput) => {
            manager.prompt(maliciousInput, maliciousInput);
            const html = manager.lastModal.innerHTML;

            if (maliciousInput.includes('<script>')) {
                return !html.includes('<script>');
            }
            return true;
        };

        await assertProperty([Arbitrary.string()], testProperty, 20);

        manager.prompt('<script>alert(1)</script>', '<img src=x onerror=alert(2)>');
        const html = manager.lastModal.innerHTML;
        expect(html.includes('<script>')).toBe(false);
        expect(html.includes('<img')).toBe(false);
    });

    it('should escape HTML in showAlert method', async () => {
        const manager = new ModalManager();
        manager.overlay.appendChild = (modal) => {
            manager.lastModal = modal;
        };

        manager.showAlert('<h1>Title</h1>', '<b>Message</b>');
        const html = manager.lastModal.innerHTML;
        expect(html.includes('<h1>')).toBe(false);
        expect(html.includes('<b>')).toBe(false);
    });

    it('should escape HTML in confirm method', async () => {
        const manager = new ModalManager();
        manager.overlay.appendChild = (modal) => {
            manager.lastModal = modal;
        };

        manager.confirm('<b>Are you sure?</b>');
        const html = manager.lastModal.innerHTML;
        expect(html.includes('<b>')).toBe(false);
    });

    it('should escape HTML in showForm method', async () => {
        const manager = new ModalManager();
        manager.overlay.appendChild = (modal) => {
            manager.lastModal = modal;
        };

        manager.showForm('<b>Form Title</b>', [{name: 'f1', label: '<i>Field</i>'}]);
        const html = manager.lastModal.innerHTML;
        expect(html.includes('<b>')).toBe(false);
        expect(html.includes('<i>')).toBe(false);
    });
});
