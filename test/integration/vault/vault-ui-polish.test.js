import { describe, it, expect } from '../../utils/test-runner.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';
import { VaultUI } from '../../../app/components/vault/vault-ui.js';
import { ModalManager } from '../../../app/components/vault/components/modal-manager.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { SecureEntry } from '../../../src/structures/vault/secure-record.js';

// Isomorphic DOM mock for Node.js environment
if (typeof document === 'undefined') {
    class MockElement {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.className = '';
            this.classList = {
                _classes: new Set(),
                add: (...c) => c.forEach(x => this.classList._classes.add(x)),
                remove: (...c) => c.forEach(x => this.classList._classes.delete(x)),
                contains: (x) => this.classList._classes.has(x) || (this.className && this.className.split(/\s+/).includes(x)),
                toggle: (x, force) => {
                    if (force !== undefined) {
                        if (force) this.classList._classes.add(x); else this.classList._classes.delete(x);
                    } else {
                        if (this.classList._classes.has(x)) this.classList._classes.delete(x); else this.classList._classes.add(x);
                    }
                }
            };
            this.style = {};
            this.attributes = {};
            this.dataset = {};
            this.children = [];
            this._innerHTML = '';
            this.textContent = '';
            this.scrollTop = 0;
            this._rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
            this._handlers = {};

            Object.defineProperty(this, 'innerHTML', {
                get: () => this._innerHTML,
                set: (v) => {
                    this._innerHTML = String(v);
                    if (!this._innerHTML) {
                        this.children.length = 0;
                    }
                }
            });
        }

        getBoundingClientRect() {
            return this._rect;
        }

        setAttribute(name, val) {
            this.attributes[name] = String(val);
            if (name.startsWith('data-')) {
                const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                this.dataset[key] = String(val);
            }
        }

        getAttribute(name) {
            return this.attributes[name] !== undefined ? this.attributes[name] : null;
        }

        removeAttribute(name) {
            delete this.attributes[name];
        }

        appendChild(child) {
            if (child) {
                child.parentNode = this;
                this.children.push(child);
            }
            return child;
        }

        remove() {
            if (this.parentNode && Array.isArray(this.parentNode.children)) {
                const idx = this.parentNode.children.indexOf(this);
                if (idx !== -1) this.parentNode.children.splice(idx, 1);
            }
        }

        addEventListener(evt, handler) {
            this._handlers[evt] = this._handlers[evt] || [];
            this._handlers[evt].push(handler);
        }

        dispatchEvent(evt) {
            const handlers = this._handlers[evt.type] || [];
            handlers.forEach(h => h(evt));
        }

        click() {
            this.dispatchEvent({ type: 'click', target: this, stopPropagation: () => {} });
        }

        querySelector(sel) {
            const match = (el) => {
                if (sel.startsWith('.')) {
                    const cls = sel.slice(1);
                    return el.classList.contains(cls);
                }
                if (sel.startsWith('#')) {
                    const id = sel.slice(1);
                    return el.getAttribute('id') === id;
                }
                if (sel.startsWith('[') && sel.includes('=')) {
                    const m = sel.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
                    if (m) return el.getAttribute(m[1]) === m[2];
                }
                return el.tagName && el.tagName.toLowerCase() === sel.toLowerCase();
            };

            const search = (node) => {
                for (const child of node.children || []) {
                    if (match(child)) return child;
                    const found = search(child);
                    if (found) return found;
                }
                return null;
            };

            return search(this);
        }

        querySelectorAll(sel) {
            const results = [];
            const match = (el) => {
                if (sel.startsWith('.')) {
                    const cls = sel.slice(1);
                    return el.classList.contains(cls);
                }
                if (sel.startsWith('[')) {
                    const m = sel.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
                    if (m) return el.getAttribute(m[1]) === m[2];
                }
                return el.tagName && el.tagName.toLowerCase() === sel.toLowerCase();
            };

            const search = (node) => {
                for (const child of node.children || []) {
                    if (match(child)) results.push(child);
                    search(child);
                }
            };

            search(this);
            return results;
        }

        focus() {}
    }

    const bodyMock = new MockElement('body');
    const store = new Map();

    global.document = {
        body: bodyMock,
        createElement: (tag) => new MockElement(tag),
        getElementById: (id) => {
            const found = bodyMock.querySelector('#' + id);
            if (found) return found;
            const el = new MockElement('div');
            el.setAttribute('id', id);
            bodyMock.appendChild(el);
            return el;
        },
        querySelector: (sel) => bodyMock.querySelector(sel),
        querySelectorAll: (sel) => bodyMock.querySelectorAll(sel)
    };

    global.window = {
        addEventListener: () => {},
        open: () => {}
    };

    global.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
    };

    if (typeof global.navigator === 'undefined') {
        global.navigator = { clipboard: { writeText: async () => {}, readText: async () => '' } };
    }
}

describe('UI Polish: Card Selection, Display Modes, Tag Occurrence & Security Gates', () => {

    it('VaultView tracks card selection and toggles aria-selected', () => {
        const events = { emit: () => {} };
        const container = document.createElement('div');
        const view = new VaultView(container, events);

        const dummyEntries = [
            { id: 'entry-1', title: 'GitHub', username: 'octocat' },
            { id: 'entry-2', title: 'ProtonMail', username: 'alice' }
        ];

        view.render(dummyEntries);
        expect(container.children.length).toBe(1); // grid
        const grid = container.children[0];
        expect(grid.children.length).toBe(2);

        // Select entry-1
        view.selectEntry('entry-1');
        expect(view.selectedId).toBe('entry-1');
        const card1 = grid.children[0];
        const card2 = grid.children[1];

        expect(card1.classList.contains('is-selected')).toBe(true);
        expect(card1.getAttribute('aria-selected')).toBe('true');
        expect(card2.classList.contains('is-selected')).toBe(false);

        // Deselect entry-1 by toggling
        view.selectEntry('entry-1', true);
        expect(view.selectedId).toBe(null);
        expect(card1.classList.contains('is-selected')).toBe(false);
        expect(card1.getAttribute('aria-selected')).toBe('false');
    });

    it('VaultView expands selected card to 4x (is-expanded) when in card or both mode', () => {
        const events = { emit: () => {} };
        const container = document.createElement('div');
        const view = new VaultView(container, events);

        const dummyEntries = [
            { id: 'card-view-test', title: 'AWS Console', username: 'admin' }
        ];

        // 1. In sidebar mode: is-selected true, is-expanded false
        view.setViewMode('sidebar');
        view.render(dummyEntries);
        view.selectEntry('card-view-test');
        const card = container.querySelector('[data-entry-id="card-view-test"]');
        expect(card).not.toBe(null);
        expect(card.classList.contains('is-selected')).toBe(true);
        expect(card.classList.contains('is-expanded')).toBe(false);

        // 2. Switch to card view mode: is-expanded becomes true
        view.setViewMode('card');
        expect(card.classList.contains('is-expanded')).toBe(true);

        // 3. Switch to both mode: is-expanded stays true
        view.setViewMode('both');
        expect(card.classList.contains('is-expanded')).toBe(true);

        // 4. Switch back to sidebar: is-expanded removed
        view.setViewMode('sidebar');
        expect(card.classList.contains('is-expanded')).toBe(false);
    });

    it('VaultView createCard renders card-expanded-content container and enables keyboard selection', () => {
        let selected = null;
        const card = VaultView.createCard({
            id: 'keyboard-card',
            title: 'GitLab',
            username: 'dev'
        }, {
            onSelect: (id) => { selected = id; }
        });

        expect(card.getAttribute('tabindex')).toBe('0');
        expect(card.innerHTML.includes('card-expanded-content')).toBe(true);

        // Simulate Enter key press
        card.dispatchEvent({
            type: 'keydown',
            key: 'Enter',
            target: card,
            preventDefault: () => {}
        });
        expect(selected).toBe('keyboard-card');
    });

    it('ModalManager calculates qualitative password strength and entropy correctly', () => {
        // Very short / empty
        const sEmpty = ModalManager.calculatePasswordStrength('');
        expect(sEmpty.score).toBe(0);

        const sShort = ModalManager.calculatePasswordStrength('abc');
        expect(sShort.score).toBe(1);
        expect(sShort.label).toBe('Very Weak');

        // Moderate
        const sMed = ModalManager.calculatePasswordStrength('password1234');
        expect(sMed.score).toBeGreaterThanOrEqual(2);

        // Strong complex password
        const sStrong = ModalManager.calculatePasswordStrength('K9#mX2$pL9@vR8!');
        expect(sStrong.score).toBeGreaterThanOrEqual(4);

        // Long entropy post-quantum grade
        const sPQ = ModalManager.calculatePasswordStrength('Correct-Horse-Battery-Staple-2026!#$Secure');
        expect(sPQ.score).toBe(5);
        expect(sPQ.label).toBe('Post-Quantum Safe');
    });

    it('ModalManager provides showShortcutsModal method', () => {
        const mm = new ModalManager();
        expect(typeof mm.showShortcutsModal).toBe('function');
    });

    it('VaultUI sorts tags by occurrence frequency by default', async () => {
        const sessionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const [e1] = await SecureEntry.create({ title: 'T1', tags: ['common', 'rare'] }, sessionKey);
        const [e2] = await SecureEntry.create({ title: 'T2', tags: ['common', 'frequent'] }, sessionKey);
        const [e3] = await SecureEntry.create({ title: 'T3', tags: ['common', 'frequent'] }, sessionKey);

        const tagList = document.getElementById('tagList');
        tagList.innerHTML = '';

        const ui = new VaultUI();
        ui.vault = new PasswordVault([e1, e2, e3], null, true, 'session-pw');
        ui.tagSortMode = 'count'; // default
        ui.renderTags();

        // 'common' count = 3, 'frequent' count = 2, 'rare' count = 1
        const renderedPills = tagList.querySelectorAll('.tag-pill');
        expect(renderedPills.length).toBe(3);
        expect(renderedPills[0].innerHTML).toContain('#common');
        expect(renderedPills[1].innerHTML).toContain('#frequent');
        expect(renderedPills[2].innerHTML).toContain('#rare');

        // Toggle to A-Z mode (default descending: A-Z)
        ui.tagSortMode = 'az';
        ui.tagSortDir = 'desc';
        ui.renderTags();
        const azPills = tagList.querySelectorAll('.tag-pill');
        expect(azPills[0].innerHTML).toContain('#common');
        expect(azPills[1].innerHTML).toContain('#frequent');
        expect(azPills[2].innerHTML).toContain('#rare'); // alphabetical: c, f, r

        // Reverse A-Z mode to ascending (Z-A)
        ui.tagSortDir = 'asc';
        ui.renderTags();
        const zaPills = tagList.querySelectorAll('.tag-pill');
        expect(zaPills[0].innerHTML).toContain('#rare');
        expect(zaPills[1].innerHTML).toContain('#frequent');
        expect(zaPills[2].innerHTML).toContain('#common');

        // Reverse count mode to ascending (least frequent first)
        ui.tagSortMode = 'count';
        ui.tagSortDir = 'asc';
        ui.renderTags();
        const countAscPills = tagList.querySelectorAll('.tag-pill');
        expect(countAscPills[0].innerHTML).toContain('#rare');      // count = 1
        expect(countAscPills[1].innerHTML).toContain('#frequent');  // count = 2
        expect(countAscPills[2].innerHTML).toContain('#common');    // count = 3
    });

    it('VaultView anchors scroll position upon card selection/expansion to eliminate jump', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.scrollTop = 100;

        const fakeEvents = { emit: () => {} };
        const view = new VaultView(container, fakeEvents);
        view.viewMode = 'both';

        const card = document.createElement('div');
        card.classList.add('password-card');
        card.setAttribute('data-entry-id', 'test-card-1');
        container.appendChild(card);

        // Simulate layout reflow: card moves down by 150px upon selection
        let callCount = 0;
        card.getBoundingClientRect = () => {
            callCount++;
            // First call is before selection (top = 200), second call is after expansion (top = 350)
            return { top: callCount === 1 ? 200 : 350, bottom: 400, left: 0, right: 300, width: 300, height: 100 };
        };

        view.selectEntry('test-card-1');

        // deltaY = 350 - 200 = 150. Container scrollTop was 100, should now be 100 + 150 = 250!
        expect(container.scrollTop).toBe(250);
    });

    it('VaultView gates OTP display inside card-expanded-content so compact home view cards omit OTP', () => {
        const entry = {
            id: 'otp-entry-1',
            title: 'GitHub',
            username: 'alice',
            tags: ['work']
        };

        const card = VaultView.createCard(entry, { viewMode: 'sidebar' });
        // The totp-slot must be inside .card-expanded-content (which has display: none on compact cards)
        expect(card.innerHTML).toContain('class="card-expanded-content"');
        expect(card.innerHTML).toContain('class="totp-slot"');

        // Assert that .totp-slot is positioned inside .card-expanded-content (after card-tags and before card-actions)
        const expandedIdx = card.innerHTML.indexOf('class="card-expanded-content"');
        const totpIdx = card.innerHTML.indexOf('class="totp-slot"');
        const actionsIdx = card.innerHTML.indexOf('class="card-actions"');
        const tagsIdx = card.innerHTML.indexOf('class="card-tags"');

        expect(totpIdx).toBeGreaterThan(expandedIdx);
        expect(totpIdx).toBeLessThan(actionsIdx);
        expect(totpIdx).toBeGreaterThan(tagsIdx);
    });

    it('VaultUI exportData enforces master password re-entry gate', async () => {
        const ui = new VaultUI();
        ui._sessionPassword = 'correctMasterPassword123';

        let exportTriggered = false;
        ui.vault = {
            isUnlocked: true,
            getPlaintextJSON: async () => {
                exportTriggered = true;
                return ['{"entries":[]}', null];
            }
        };

        // Case 1: Wrong password entered -> aborts export
        ui.modals.prompt = async () => 'wrongPassword';
        await ui.exportData();
        expect(exportTriggered).toBe(false);

        // Case 2: User cancels prompt (null) -> aborts export
        ui.modals.prompt = async () => null;
        await ui.exportData();
        expect(exportTriggered).toBe(false);

        // Case 3: Correct password entered -> confirms warning -> succeeds
        ui.modals.prompt = async () => 'correctMasterPassword123';
        ui.modals.confirm = async () => true;
        await ui.exportData();
        expect(exportTriggered).toBe(true);
    });

    it('VaultUI calculates relative directory vs stego vs vault sizing', async () => {
        const ui = new VaultUI();
        ui.vault = new PasswordVault([], null, true, 'test-pw');
        ui.totalDirectoryBytes = 104857600; // 100 MB
        ui.totalCapacity = 1048576;         // 1 MB
        ui._sessionPassword = 'test-pw';

        const capacityText = document.getElementById('capacityText');
        ui.updateState();

        expect(capacityText.textContent).toContain('Used:');
        expect(capacityText.textContent).toContain('Total: 1 MB');
        expect(capacityText.title).toContain('Carrier Directory: 100 MB');
        expect(capacityText.title).toContain('Stego Capacity: 1 MB');
    });

    it('VaultUI handles viewMode persistence and mode switching', () => {
        const ui = new VaultUI();
        ui.setViewMode('card');
        expect(ui.viewMode).toBe('card');
        expect(localStorage.getItem('ollie-view-mode')).toBe('card');

        ui.setViewMode('both');
        expect(ui.viewMode).toBe('both');
        expect(localStorage.getItem('ollie-view-mode')).toBe('both');

        ui.setViewMode('sidebar');
        expect(ui.viewMode).toBe('sidebar');
        expect(localStorage.getItem('ollie-view-mode')).toBe('sidebar');
    });
});
