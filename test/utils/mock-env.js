import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let elementRegistry = new Map();
let storageStore = new Map();
let docHandlers = {};
let htmlContent = '';
let bodyElement = null;

function createMockElement(tag, id = null) {
    const classes = new Set();
    const attributes = {};
    if (id) attributes['id'] = id;
    const children = [];
    const handlers = {};
    const dataset = {};

    const styleObj = {
        setProperty: (prop, val) => { styleObj[prop] = String(val); },
        removeProperty: (prop) => { delete styleObj[prop]; },
        getPropertyValue: (prop) => styleObj[prop] || ''
    };

    let _innerHTML = '';

    const el = {
        tagName: tag.toUpperCase(),
        style: styleObj,
        dataset,
        children,
        title: '',
        textContent: '',
        disabled: false,
        _handlers: handlers,
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            contains: (x) => classes.has(x),
            toggle: (x, force) => {
                if (force !== undefined) {
                    if (force) classes.add(x); else classes.delete(x);
                } else {
                    if (classes.has(x)) classes.delete(x); else classes.add(x);
                }
            }
        },
        scrollTop: 0,
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        addEventListener: (evt, h) => {
            handlers[evt] = handlers[evt] || [];
            handlers[evt].push(h);
        },
        removeEventListener: (evt, h) => {
            if (handlers[evt]) handlers[evt] = handlers[evt].filter(f => f !== h);
        },
        matches: function (sel) {
            const selectors = sel.split(',').map(s => s.trim()).filter(Boolean);
            for (const s of selectors) {
                if (s.startsWith('.')) {
                    if (el.classList && el.classList.contains(s.slice(1))) return true;
                } else if (s.startsWith('#')) {
                    if (el.getAttribute && el.getAttribute('id') === s.slice(1)) return true;
                } else if (s.startsWith('[') && s.includes('=')) {
                    const m = s.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
                    if (m && el.getAttribute && el.getAttribute(m[1]) === m[2]) return true;
                } else if (el.tagName && el.tagName.toLowerCase() === s.toLowerCase()) {
                    return true;
                }
            }
            return false;
        },
        closest: function (sel) {
            let cur = el;
            while (cur) {
                if (cur.matches && cur.matches(sel)) return cur;
                cur = cur.parentNode;
            }
            return null;
        },
        dispatchEvent: (evt) => {
            if (!evt.target) evt.target = el;
            let cur = el;
            while (cur) {
                const list = cur._handlers ? (cur._handlers[evt.type] || []) : (cur.addEventListener ? [] : []);
                list.forEach(h => h(evt));
                if (evt.bubbles && cur.parentNode) {
                    cur = cur.parentNode;
                } else {
                    break;
                }
            }
        },
        click: () => {
            el.dispatchEvent({ type: 'click', target: el, stopPropagation: () => {} });
        },
        contains: (c) => children.includes(c) || c === el,
        attachShadow: ({ mode }) => {
            const s = createMockElement('shadow-root');
            s.mode = mode;
            return s;
        },
        appendChild: (child) => {
            if (child) {
                child.parentNode = el;
                children.push(child);
            }
            return child;
        },
        remove: () => {
            if (el.parentNode && Array.isArray(el.parentNode.children)) {
                const idx = el.parentNode.children.indexOf(el);
                if (idx !== -1) el.parentNode.children.splice(idx, 1);
            }
        },
        getAttribute: (attr) => attributes[attr] !== undefined ? attributes[attr] : null,
        setAttribute: (attr, val) => {
            attributes[attr] = String(val);
            if (attr === 'id') elementRegistry.set(String(val), el);
            if (attr === 'class') {
                el.className = String(val);
            }
            if (attr.startsWith('data-')) {
                const key = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                dataset[key] = String(val);
            }
        },
        removeAttribute: (attr) => {
            delete attributes[attr];
        },
        querySelector: function (sel) {
            const match = (item) => {
                if (!item) return false;
                if (sel.startsWith('.')) return item.classList && item.classList.contains(sel.slice(1));
                if (sel.startsWith('#')) return item.getAttribute && item.getAttribute('id') === sel.slice(1);
                if (sel.startsWith('[') && sel.includes('=')) {
                    const m = sel.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
                    if (m) return item.getAttribute && item.getAttribute(m[1]) === m[2];
                }
                return item.tagName && item.tagName.toLowerCase() === sel.toLowerCase();
            };
            const search = (node) => {
                for (const child of node.children || []) {
                    if (match(child)) return child;
                    const found = search(child);
                    if (found) return found;
                }
                return null;
            };
            const foundChild = search(el);
            if (foundChild) return foundChild;

            if (_innerHTML) {
                if (sel.startsWith('.')) {
                    const cls = sel.slice(1);
                    if (new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'i').test(_innerHTML)) {
                        const dummy = createMockElement('div');
                        dummy.classList.add(cls);
                        return dummy;
                    }
                }
                if (sel.startsWith('#')) {
                    const id = sel.slice(1);
                    if (new RegExp(`id="${id}"`, 'i').test(_innerHTML)) {
                        return globalThis.document.getElementById(id);
                    }
                }
                if (new RegExp(`<${sel}\\b`, 'i').test(_innerHTML)) {
                    return createMockElement(sel);
                }
            }
            return null;
        },
        querySelectorAll: function (sel) {
            const results = [];
            const match = (item) => {
                if (!item) return false;
                if (sel.startsWith('.')) return item.classList && item.classList.contains(sel.slice(1));
                if (sel.startsWith('#')) return item.getAttribute && item.getAttribute('id') === sel.slice(1);
                if (sel.startsWith('[') && sel.includes('=')) {
                    const m = sel.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
                    if (m) return item.getAttribute && item.getAttribute(m[1]) === m[2];
                }
                return item.tagName && item.tagName.toLowerCase() === sel.toLowerCase();
            };
            const search = (node) => {
                for (const child of node.children || []) {
                    if (match(child)) results.push(child);
                    search(child);
                }
            };
            search(el);
            return results;
        },
        focus: () => { }
    };

    Object.defineProperty(el, 'className', {
        get: () => Array.from(classes).join(' '),
        set: (v) => {
            classes.clear();
            if (v) String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
        }
    });

    Object.defineProperty(el, 'href', {
        get: () => el.getAttribute('href') || '',
        set: (v) => el.setAttribute('href', v)
    });
    Object.defineProperty(el, 'download', {
        get: () => el.getAttribute('download') || '',
        set: (v) => el.setAttribute('download', v)
    });
    Object.defineProperty(el, 'type', {
        get: () => el.getAttribute('type') || '',
        set: (v) => el.setAttribute('type', v)
    });
    Object.defineProperty(el, 'checked', {
        get: () => el.getAttribute('checked') !== null,
        set: (v) => { if (v) el.setAttribute('checked', ''); else el.removeAttribute('checked'); }
    });
    Object.defineProperty(el, 'innerHTML', {
        get: () => _innerHTML,
        set: (v) => {
            _innerHTML = String(v);
            if (!_innerHTML) {
                children.length = 0;
            }
        }
    });

    if (id) elementRegistry.set(id, el);
    return el;
}

export function setupMockEnvironment(customHtmlPath = null) {
    const defaultHtmlPath = path.resolve(__dirname, '../../app/vault.html');
    const targetPath = customHtmlPath || defaultHtmlPath;
    if (fs.existsSync(targetPath)) {
        htmlContent = fs.readFileSync(targetPath, 'utf8');
    } else {
        htmlContent = '';
    }

    elementRegistry = new Map();
    storageStore = new Map();
    docHandlers = {};
    bodyElement = createMockElement('body');

    globalThis.document = {
        body: bodyElement,
        createElement: (tag) => createMockElement(tag),
        getElementById: (id) => {
            if (elementRegistry.has(id)) {
                return elementRegistry.get(id);
            }
            const regex = new RegExp(`<(\\w+)[^>]*id=["']${id}["'][^>]*>`, 'i');
            const match = htmlContent.match(regex);
            const tag = match ? match[1] : 'div';
            const el = createMockElement(tag, id);
            return el;
        },
        querySelector: (sel) => {
            if (sel.startsWith('#')) {
                return globalThis.document.getElementById(sel.slice(1));
            }
            return bodyElement.querySelector(sel);
        },
        querySelectorAll: (sel) => bodyElement.querySelectorAll(sel),
        addEventListener: (t, fn, opts) => {
            docHandlers[t] = docHandlers[t] || [];
            const capture = opts === true || (opts && opts.capture);
            docHandlers[t].push({ fn, capture });
        },
        removeEventListener: (t, fn) => {
            if (docHandlers[t]) docHandlers[t] = docHandlers[t].filter(h => h.fn !== fn);
        },
        dispatchEvent: (e) => {
            let stopped = false;
            const origStop = e.stopImmediatePropagation;
            e.stopImmediatePropagation = () => {
                stopped = true;
                if (origStop) origStop();
            };
            const list = docHandlers[e.type] || [];
            const sorted = [...list.filter(h => h.capture), ...list.filter(h => !h.capture)];
            for (const h of sorted) {
                if (stopped) break;
                h.fn(e);
            }
        }
    };

    globalThis.localStorage = {
        getItem: (k) => (storageStore.has(k) ? storageStore.get(k) : null),
        setItem: (k, v) => storageStore.set(k, String(v)),
        removeItem: (k) => storageStore.delete(k),
        clear: () => storageStore.clear()
    };

    globalThis.window = {
        __TEST_RUNNER__: true,
        addEventListener: (event, callback) => {
            if (event === 'DOMContentLoaded') {
                callback();
            }
        },
        removeEventListener: () => { },
        open: () => { }
    };
}

export function resetMockEnvironment() {
    if (elementRegistry) elementRegistry.clear();
    if (storageStore) storageStore.clear();
    for (const k in docHandlers) {
        delete docHandlers[k];
    }
    if (bodyElement) {
        bodyElement.children.length = 0;
        bodyElement.innerHTML = '';
        bodyElement.className = '';
    }
}
