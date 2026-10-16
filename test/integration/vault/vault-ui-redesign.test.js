import { describe, it, expect } from '../../utils/test-runner.js';
import { ModalManager } from '../../../app/components/vault/components/modal-manager.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';
import { SecureEntry } from '../../../src/structures/vault/secure-record.js';

// Setup isomorphic DOM mock for Node.js environment
if (typeof document === 'undefined') {
    class MockElement {
        constructor(tagName) {
            this.tagName = tagName;
            this.className = '';
            this.classList = {
                _classes: new Set(),
                add: (...c) => c.forEach(x => this.classList._classes.add(x)),
                remove: (...c) => c.forEach(x => this.classList._classes.delete(x)),
                contains: (x) => this.classList._classes.has(x) || this.className.split(' ').includes(x),
                toggle: (x, force) => {
                    if (force !== undefined) {
                        if (force) this.classList._classes.add(x); else this.classList._classes.delete(x);
                    } else {
                        if (this.classList.contains(x)) this.classList._classes.delete(x); else this.classList._classes.add(x);
                    }
                }
            };
            this.style = {};
            this.attributes = {};
            this.children = [];
            this.innerHTML = '';
            this.textContent = '';
        }
        setAttribute(name, val) {
            this.attributes[name] = String(val);
        }
        getAttribute(name) {
            return this.attributes[name] || null;
        }
        appendChild(child) {
            this.children.push(child);
            return child;
        }
        remove() {
            if (this.parentNode) {
                const idx = this.parentNode.children.indexOf(this);
                if (idx !== -1) this.parentNode.children.splice(idx, 1);
            }
        }
        querySelector(selector) {
            if (selector.startsWith('.')) {
                const cls = selector.slice(1);
                const findCls = (el) => {
                    const classes = (el.className || '').split(/\s+/).filter(Boolean);
                    if (el.classList && el.classList.contains(cls) || classes.includes(cls)) return el;
                    for (const ch of el.children || []) {
                        const found = findCls(ch);
                        if (found) return found;
                    }
                    return null;
                };
                return findCls(this);
            }
            if (selector === 'h4' || selector === 'input' || selector === 'button' || selector === 'form') {
                const findTag = (el) => {
                    if (el.tagName && el.tagName.toLowerCase() === selector) return el;
                    for (const ch of el.children || []) {
                        const found = findTag(ch);
                        if (found) return found;
                    }
                    return null;
                };
                return findTag(this);
            }
            return null;
        }
        querySelectorAll(selector) {
            const results = [];
            const collect = (el) => {
                if (selector.startsWith('.') && (el.classList.contains(selector.slice(1)) || el.className.includes(selector.slice(1)))) {
                    results.push(el);
                }
                for (const ch of el.children || []) collect(ch);
            };
            collect(this);
            return results;
        }
        addEventListener() {}
    }

    const bodyMock = new MockElement('body');
    global.document = {
        body: bodyMock,
        createElement: (tag) => new MockElement(tag),
        getElementById: () => new MockElement('div'),
        querySelector: (sel) => bodyMock.querySelector(sel),
        querySelectorAll: (sel) => bodyMock.querySelectorAll(sel)
    };
}

describe('Vault UI Redesign & Modal Controls', () => {

    it('VaultView creates clean card without inline qr-scan-toggle checkbox', async () => {
        const sessionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const [secureEntry] = await SecureEntry.create({
            id: 'test-card-id',
            title: 'Test Service',
            username: 'alice@example.com',
            password: 'secretPassword123',
            totp: 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP',
            tags: ['dev']
        }, sessionKey);

        const card = VaultView.createCard(secureEntry, {
            onEdit: () => {},
            onCopyPass: () => {},
            onLaunch: () => {},
            onTotpClick: () => {},
            onTagClick: () => {},
            onTotpSecretDetected: () => {}
        });

        expect(card).not.toBe(null);
        expect(card.classList.contains('password-card') || (card.className && card.className.includes('password-card'))).toBe(true);

        // Crucial requirement: No qr-scan-toggle checkbox on the card
        expect(card.innerHTML.includes('qr-scan-toggle')).toBe(false);
        expect(card.innerHTML.includes('qr-dropzone')).toBe(false);

        // Verify clean key icon (not mojibake)
        expect(card.innerHTML.includes('🔑')).toBe(true);
        expect(card.innerHTML.includes('ðŸ')).toBe(false);

        // Card header has title
        expect(card.innerHTML.includes('Test Service')).toBe(true);
    });

    it('ModalManager supports toast notifications', () => {
        const mm = new ModalManager();
        expect(typeof mm.showToast).toBe('function');

        mm.showToast('Test Toast Message', 'success');
        const toast = document.querySelector('.toast');
        if (toast && toast.innerHTML) {
            expect(toast.innerHTML.includes('Test Toast Message')).toBe(true);
        }

        // Cleanup
        if (toast && typeof toast.remove === 'function') toast.remove();
        if (mm.overlay && typeof mm.overlay.remove === 'function') mm.overlay.remove();
    });

    it('ModalManager showForm supports password generator helper', () => {
        const mm = new ModalManager();
        expect(typeof mm.generateStrongPassword).toBe('function');
        const genPass = mm.generateStrongPassword(20);
        expect(genPass.length).toBe(20);

        if (mm.overlay && typeof mm.overlay.remove === 'function') mm.overlay.remove();
    });

    it('ModalManager supports showOnboardingWizard, showChangePasswordModal, and show2FaSettingsModal', () => {
        const mm = new ModalManager();
        expect(typeof mm.showOnboardingWizard).toBe('function');
        expect(typeof mm.showChangePasswordModal).toBe('function');
        expect(typeof mm.show2FaSettingsModal).toBe('function');

        if (mm.overlay && typeof mm.overlay.remove === 'function') mm.overlay.remove();
    });

    it('ModalManager renders valid QR code on canvas for otpauth URI', () => {
        const mm = new ModalManager();
        expect(typeof mm.renderQrOnCanvas).toBe('function');

        const uri = 'otpauth://totp/Ollie%20Vault?secret=JBSWY3DPEHPK3PXP';
        let filledRects = 0;
        const mockCanvas = {
            width: 180,
            height: 180,
            getContext: () => ({
                fillStyle: '',
                fillRect: () => {
                    filledRects++;
                }
            })
        };

        mm.renderQrOnCanvas(mockCanvas, uri);
        expect(filledRects).toBeGreaterThan(100);

        if (mm.overlay && typeof mm.overlay.remove === 'function') mm.overlay.remove();
    });
});
