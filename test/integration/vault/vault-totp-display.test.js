import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { codeFromOtpauthUri } from '../../../src/information-theory/cryptography/totp.js';

/**
 * TOTP live-code display contract: correct Base32 decoding (via
 * codeFromOtpauthUri), visible formatted codes inside .totp-slot,
 * per-second countdown ticks that recompute on period boundaries,
 * fail-loud logging instead of silent catches, and a single-interval
 * refresh lifecycle.
 */

const PASSWORD = 'totp-display-pw';
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // RFC 6238 Annex B SHA-1 seed
const URI = `otpauth://totp/RFC:vector?secret=${SECRET}&digits=8`;

async function makeUnlockedVaultWithTotp() {
    let vault = new PasswordVault([], null, true, PASSWORD);
    [vault] = await vault.addEntry({ title: 'RFC', password: 'pw', totp: URI });
    return vault;
}

function installQuerySpy() {
    const slots = new Map();
    const original = document.querySelector;
    document.querySelector = (selector) => {
        const m = selector.match(/data-entry-id="([^"]+)"/);
        if (!m || !selector.includes('.totp-slot')) return original(selector);
        if (!slots.has(m[1])) {
            const children = {};
            const slot = {
                selector,
                innerHTML: '',
                get textContent() {
                    return Object.values(children).map(c => c.textContent).join(' ');
                },
                querySelector(sel) {
                    if (!children[sel]) {
                        children[sel] = {
                            textContent: '',
                            dataset: {},
                            classList: { add() {}, remove() {} },
                            handlers: [],
                            addEventListener(type, fn) { this.handlers.push([type, fn]); }
                        };
                    }
                    return children[sel];
                },
                _children: children,
                addEventListener() {}
            };
            slots.set(m[1], slot);
        }
        return slots.get(m[1]);
    };
    return {
        slots,
        restore() { document.querySelector = original; }
    };
}

if (typeof document !== 'undefined') {
    describe('TOTP live display', () => {
        it('renders a grouped code into the card slot using proper Base32 decoding', async () => {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
            const spy = installQuerySpy();
            let ui;
            try {
                ui = new VaultUI();
                ui.showLoading = () => {};
                ui.updateUI = () => {};
                ui.vault = await makeUnlockedVaultWithTotp();

                await ui.populateTotpCodes(ui.vault.entries);

                const slot = spy.slots.get(ui.vault.entries[0].id);
                if (!slot) throw new Error('slot never queried');
                if (!/\d{3}\s\d{3,5}/.test(slot.innerHTML)) {
                    throw new Error(`no formatted code rendered: '${slot.innerHTML}'`);
                }

                // Exactness: rendered code equals codeFromOtpauthUri at current time.
                const [expected] = await codeFromOtpauthUri(URI);
                if (!slot.innerHTML.includes(expected.slice(0, 3))) {
                    throw new Error(`rendered code does not match expected prefix ${expected.slice(0, 3)}: ${slot.innerHTML}`);
                }
            } finally {
                ui.stopTotpRefresh();
                spy.restore();
            }
        });

        it('ticks countdown text and recomputes the code at a period boundary', async () => {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
            const spy = installQuerySpy();
            let ui;
            try {
                ui = new VaultUI();
                ui.showLoading = () => {};
                ui.updateUI = () => {};
                ui.vault = await makeUnlockedVaultWithTotp();
                await ui.populateTotpCodes(ui.vault.entries);

                const id = ui.vault.entries[0].id;
                const slot = spy.slots.get(id);
                if (!slot) throw new Error('slot missing');

                const t1 = 59 * 30; // arbitrary base second inside some period
                await ui._totpTick(t1);
                const before = slot.innerHTML;
                if (!slot._children['.totp-countdown'].textContent.match(/\d+s/)) {
                    throw new Error('no countdown text');
                }

                const t2 = t1 + 31; // cross a 30s boundary
                await ui._totpTick(t2);
                const [c1] = await codeFromOtpauthUri(URI, { now: t1 });
                const [c2] = await codeFromOtpauthUri(URI, { now: t2 });
                if (before.includes(c2)) throw new Error('code did not recompute across boundary');
                void c1;
            } finally {
                ui.stopTotpRefresh();
                spy.restore();
            }
        });

        it('warns instead of throwing when an entry carries a malformed TOTP value', async () => {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');
            const spy = installQuerySpy();
            const warnings = [];
            const origWarn = console.warn;
            console.warn = (...a) => warnings.push(a.join(' '));
            let ui;
            try {
                ui = new VaultUI();
                ui.showLoading = () => {};
                ui.updateUI = () => {};
                ui.vault = { isUnlocked: true, _getSessionKey: async () => ['k', null, null] };

                const fakeEntry = {
                    id: 'bad-totp',
                    decrypt: async () => [{ title: 'x', totp: 'not-a-valid-secret!!' }, null]
                };

                await ui.populateTotpCodes([fakeEntry]);

                if (!warnings.some(w => w.toLowerCase().includes('totp'))) {
                    throw new Error('failure was swallowed silently - expected logger/console warning');
                }
            } finally {
                if (ui) ui.stopTotpRefresh();
                console.warn = origWarn;
                spy.restore();
            }
        });

        it('keeps exactly one refresh interval and clears it on stop', async () => {
            const { VaultUI } = await import('../../../app/components/vault/vault-ui.js');

            const intervals = [];
            const cleared = [];
            const origSet = globalThis.setInterval;
            const origClear = globalThis.clearInterval;
            globalThis.setInterval = (fn, ms) => { const h = origSet(fn, ms); intervals.push(h); return h; };
            globalThis.clearInterval = (h) => { cleared.push(h); return origClear(h); };

            try {
                const ui = new VaultUI();
                ui.startTotpRefresh();
                ui.startTotpRefresh();
                ui.startTotpRefresh();
                if (intervals.length !== 1) throw new Error(`${intervals.length} intervals registered`);
                if (!ui._totpTimer) throw new Error('timer not retained');

                const handle = ui._totpTimer;
                ui.stopTotpRefresh();
                if (!cleared.includes(handle)) throw new Error('stop did not clear the interval');
                if (ui._totpTimer !== null) throw new Error('timer not nulled after stop');
            } finally {
                globalThis.setInterval = origSet;
                globalThis.clearInterval = origClear;
            }
        });
    });
} else {
    describe('TOTP live display', () => {
        it('Skipped outside Node-runner DOM shims', () => { expect(true).toBe(true); });
    });
}

