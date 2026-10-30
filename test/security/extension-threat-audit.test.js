import { describe, it, expect } from '../utils/test-runner.js';
import { BatchExtractor } from '../../src/information-theory/steganography/batch-extractor.js';
import { BatchEmbedder } from '../../src/information-theory/steganography/batch-embedder.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';
import { JpegTranscoder } from '../../src/codec/transcoder.js';
import { WorkerPool } from '../../src/utils/concurrency/worker-pool.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';
import { DropZone } from '../../app/components/vault/components/drop-zone.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

if (typeof globalThis.document === 'undefined') {
    const createMockElement = (tag) => {
        const classes = new Set();
        const attributes = {};
        const handlers = {};
        const children = [];
        let shadowRoot = null;
        const el = {
            tagName: tag.toUpperCase(),
            children,
            style: { display: '' },
            classList: {
                add: (...c) => c.forEach(x => classes.add(x)),
                remove: (...c) => c.forEach(x => classes.delete(x)),
                contains: (x) => classes.has(x)
            },
            setAttribute: (k, v) => { attributes[k] = String(v); },
            getAttribute: (k) => attributes[k] || null,
            appendChild: (c) => { children.push(c); return c; },
            contains: (c) => children.includes(c) || c === el,
            attachShadow: ({ mode }) => {
                shadowRoot = createMockElement('shadow-root');
                shadowRoot.mode = mode;
                return shadowRoot;
            },
            addEventListener: (t, fn, opts) => {
                handlers[t] = handlers[t] || [];
                const capture = opts === true || (opts && opts.capture);
                handlers[t].push({ fn, capture });
            },
            dispatchEvent: (e) => {
                let stopped = false;
                const origStop = e.stopImmediatePropagation;
                e.stopImmediatePropagation = () => {
                    stopped = true;
                    if (origStop) origStop();
                };
                const list = handlers[e.type] || [];
                const sorted = [...list.filter(h => h.capture), ...list.filter(h => !h.capture)];
                for (const h of sorted) {
                    if (stopped) break;
                    h.fn(e);
                }
            },
            querySelector: (sel) => {
                if (sel.includes('.password-card')) return children.find(c => c.classList.contains('password-card')) || null;
                if (sel.includes('.btn-copy')) return children.find(c => c.classList.contains('btn-copy')) || null;
                if (sel.includes('.password-shadow-host')) return children.find(c => c.classList.contains('password-shadow-host')) || null;
                if (sel.includes('.prompt-input') || sel.includes('password')) {
                    return children.find(c => c.classList.contains('prompt-input') || c.tagName === 'INPUT') || null;
                }
                for (const child of children) {
                    const match = child.querySelector ? child.querySelector(sel) : null;
                    if (match) return match;
                }
                return null;
            }
        };
        return el;
    };
    const bodyEl = createMockElement('body');
    const docHandlers = {};
    globalThis.document = {
        createElement: (tag) => createMockElement(tag),
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
        },
        querySelector: (sel) => bodyEl.querySelector(sel),
        body: bodyEl
    };
}

class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
        this.size = buffer.length;
    }
    async arrayBuffer() {
        return this.buffer.buffer.slice(
            this.buffer.byteOffset,
            this.buffer.byteOffset + this.buffer.byteLength
        );
    }
}

async function makeCarriers(count) {
    const width = 256;
    const height = 256;
    const data = new Uint8ClampedArray(width * height * 4);
    let seed = 9876543;
    for (let i = 0; i < data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed >>> 24) & 0xFF;
        data[i + 1] = (seed >>> 16) & 0xFF;
        data[i + 2] = (seed >>> 8) & 0xFF;
        data[i + 3] = 255;
    }
    const encoder = new JpegEncoder(90);
    const out = [];
    for (let i = 0; i < count; i++) {
        const jpegBytes = await encoder.encode({ width, height, data });
        out.push(new MockFile(jpegBytes, `carrier_${i}.jpg`));
    }
    return out;
}

describe('Red Team Adversarial Audit: Failing Reproduction Test Suite', () => {

    // -------------------------------------------------------------------------
    // SEC-01: Missing bindChunkRecords enforcement in batch-extractor.js
    // -------------------------------------------------------------------------
    it('SEC-01: batch-extractor fails closed at manifest layer when carrier chunk checksum is tampered', async () => {
        const password = 'AdversarialTestPassword1!';
        const testCarriers = await makeCarriers(3);
        const embedder = new BatchEmbedder();
        const payload = new TextEncoder().encode(JSON.stringify({ vault: 'sensitive-payload' }));

        const [embedded, embedErr] = await embedder.embed(payload, testCarriers, {
            password,
            filename: 'vault.json',
            manifest: { revision: 1 }
        });
        expect(embedErr).toBe(null);

        const stegoFiles = embedded.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));

        // Decode carrier 1 to get its authentic signed metadata and stripe data
        const decoder = new JpegDecoder();
        const [dec1, decErr] = await decoder.decode(new Uint8Array(await stegoFiles[1].arrayBuffer()), { password });
        expect(decErr).toBe(null);

        // Tamper with carrier 1's stripe data (corrupting the payload bytes)
        const tamperedData = new Uint8Array(dec1.secretData.length);
        tamperedData.set(dec1.secretData);
        tamperedData[0] ^= 0xFF;
        tamperedData[1] ^= 0xAA;

        // Re-transcode carrier 1 with the tampered secretData while keeping the original authentic signed manifest
        const transcoder = new JpegTranscoder();
        const [tamperedBytes, transErr] = await transcoder.updateSecret(
            new Uint8Array(await testCarriers[1].arrayBuffer()),
            tamperedData,
            {
                metadata: dec1.secretMetadata,
                password
            }
        );
        expect(transErr).toBe(null);

        const tamperedFiles = [
            stegoFiles[0],
            new MockFile(tamperedBytes, 'tampered_carrier_1.jpg'),
            stegoFiles[2]
        ];

        const extractor = new BatchExtractor();
        const [result, extractErr] = await extractor.extract(tamperedFiles, password);

        // Under SEC-01 mitigation, extraction MUST fail closed at the manifest chunk authentication layer
        // (via bindChunkRecords), rather than passing manifest verification and failing downstream in CSS envelope.
        expect(result).toBe(null);
        expect(extractErr).not.toBe(null);
        expect(extractErr.message).toMatch(/manifest.*checksum|chunk.*authentication/i);
    });

    // -------------------------------------------------------------------------
    // SEC-02: Plaintext master password transmitted over postMessage
    // -------------------------------------------------------------------------
    it('SEC-02 (Embed): BatchEmbedder.embed does not transmit plaintext password over Worker postMessage', async () => {
        const testPassword = 'ExfiltrateMasterPassword999!';
        const capturedMessages = [];
        const originalPost = Worker.prototype.postMessage;

        Worker.prototype.postMessage = function(data) {
            try {
                capturedMessages.push(JSON.parse(JSON.stringify(data)));
            } catch {
                capturedMessages.push(data);
            }
            return originalPost.apply(this, arguments);
        };

        try {
            const carriers = await makeCarriers(2);
            const embedder = new BatchEmbedder();
            const payload = new Uint8Array([10, 20, 30, 40]);

            const [, err] = await embedder.embed(payload, carriers, {
                password: testPassword,
                filename: 'test.dat',
                manifest: { revision: 1 }
            });
            expect(err).toBe(null);

            // Verify that no worker message contains the raw password
            const leaked = capturedMessages.filter(msg => {
                const str = JSON.stringify(msg);
                return str.includes(testPassword);
            });

            expect(leaked.length).toBe(0);
        } finally {
            Worker.prototype.postMessage = originalPost;
        }
    });

    it('SEC-02 (Extract): BatchExtractor.extract does not transmit plaintext password over Worker postMessage', async () => {
        const testPassword = 'ExfiltrateMasterPassword888!';
        const carriers = await makeCarriers(2);
        const embedder = new BatchEmbedder();
        const payload = new Uint8Array([11, 22, 33, 44]);

        const [embedded, embedErr] = await embedder.embed(payload, carriers, {
            password: testPassword,
            filename: 'test.dat',
            manifest: { revision: 1 }
        });
        expect(embedErr).toBe(null);

        const stegoFiles = embedded.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));
        const capturedMessages = [];
        const originalPost = Worker.prototype.postMessage;

        Worker.prototype.postMessage = function(data) {
            try {
                capturedMessages.push(JSON.parse(JSON.stringify(data)));
            } catch {
                capturedMessages.push(data);
            }
            return originalPost.apply(this, arguments);
        };

        try {
            const extractor = new BatchExtractor();
            const [, extractErr] = await extractor.extract(stegoFiles, testPassword);
            expect(extractErr).toBe(null);

            // Verify that no worker message contains the raw password
            const leaked = capturedMessages.filter(msg => {
                const str = JSON.stringify(msg);
                return str.includes(testPassword);
            });

            expect(leaked.length).toBe(0);
        } finally {
            Worker.prototype.postMessage = originalPost;
        }
    });

    // -------------------------------------------------------------------------
    // SEC-03: Missing Content Security Policy in app/vault.html and dev-server.js
    // -------------------------------------------------------------------------
    it('SEC-03: app/vault.html declares strict Content-Security-Policy meta tag', () => {
        const html = fs.readFileSync(path.resolve('app/vault.html'), 'utf8');
        const hasCspMeta = /<meta\s+http-equiv=["']Content-Security-Policy["']/i.test(html);
        expect(hasCspMeta).toBe(true);
        expect(html).toMatch(/script-src\s+['"]self['"]/i);
        expect(html).toMatch(/object-src\s+['"]none['"]/i);
    });

    it('SEC-03: scripts/dev-server.js includes Content-Security-Policy response header', () => {
        const serverSrc = fs.readFileSync(path.resolve('scripts/dev-server.js'), 'utf8');
        expect(serverSrc).toMatch(/Content-Security-Policy/i);
    });

    // -------------------------------------------------------------------------
    // SEC-04: Automated credential harvesting via synthetic clicks (isTrusted)
    // -------------------------------------------------------------------------
    it('SEC-04: VaultView entry card ignores untrusted synthetic click events from extensions', () => {
        let selectCalled = false;
        let copyCalled = false;

        const card = VaultView.createCard(
            { id: 'entry-sec-4', title: 'TopSecret', username: 'admin', password: 'plain-password-123' },
            {
                onSelect: () => { selectCalled = true; },
                onCopy: () => { copyCalled = true; }
            }
        );
        expect(card).not.toBe(null);

        // Dispatch synthetic untrusted click event (simulating extension content script)
        const untrustedClick = { type: 'click', isTrusted: false, stopPropagation: () => {} };
        card.dispatchEvent(untrustedClick);

        // Under SEC-04 mitigation, handlers MUST verify event.isTrusted === true before revealing/selecting
        expect(selectCalled).toBe(false);

        const copyBtn = card.querySelector('.btn-copy');
        if (copyBtn) {
            copyBtn.dispatchEvent(untrustedClick);
            expect(copyCalled).toBe(false);
        }
    });

    // -------------------------------------------------------------------------
    // SEC-05: Master password keystroke logging via shared DOM event listeners
    // -------------------------------------------------------------------------
    it('SEC-05: ModalManager isolates master password input inside Closed Shadow DOM to prevent keystroke sniffing', () => {
        const modalManager = new ModalManager();
        modalManager.prompt('Unlock Vault', 'Master Password', 'password');

        // Extension content script searches for password inputs in the open document
        const inputInDocument = document.querySelector('.prompt-input, input[type="password"]');

        // Under SEC-05 mitigation, the password field MUST be encapsulated inside Closed Shadow DOM
        // and cannot be queried directly from document scope.
        expect(inputInDocument).toBe(null);
    });

    // -------------------------------------------------------------------------
    // SEC-06: Carrier file theft via capturing-phase drag-and-drop sniffing
    // -------------------------------------------------------------------------
    it('SEC-06: DropZone intercepts drag-and-drop events in capturing phase to stop extension sniffing', () => {
        let extensionSniffed = false;
        const dropZoneEl = document.createElement('div');
        dropZoneEl.id = 'dropZone';
        document.body.appendChild(dropZoneEl);

        // Extension content script sets capturing listener on document/window
        document.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files) {
                extensionSniffed = true;
            }
        });

        new DropZone(dropZoneEl, () => {});

        // Simulate file drop
        const mockDropEvent = {
            type: 'drop',
            target: dropZoneEl,
            dataTransfer: { files: [new MockFile(new Uint8Array(100), 'vault_carrier.jpg')] },
            preventDefault: () => {},
            stopPropagation: () => {},
            stopImmediatePropagation: () => {}
        };

        // When drop occurs, document dispatches to listeners
        document.dispatchEvent(mockDropEvent);

        // Under SEC-06 mitigation, DropZone intercepts and stops capture propagation
        expect(extensionSniffed).toBe(false);
    });

    // -------------------------------------------------------------------------
    // SEC-07: Pre-authentication parsing attack surface
    // -------------------------------------------------------------------------
    it('SEC-07: Steganographic extraction validates carrier manifest structure before expensive trellis decoding', async () => {
        const workerScript = new URL('../../src/codec/carrier.worker.js', import.meta.url);
        const pool = new WorkerPool({ workerScript, maxWorkers: 1 });
        try {
            // Valid JPEG image, but missing stego container header
            const carriers = await makeCarriers(1);
            const rawJpeg = new Uint8Array(await carriers[0].arrayBuffer());

            const [result, err] = await pool.dispatch('extract-payload', {
                jpegBytes: rawJpeg,
                password: 'test-password',
                options: { failFastNoContainer: true }
            });

            // Under SEC-07 mitigation, should fail fast indicating no valid container signature
            expect(result?.secretData).toBe(null);
            expect(err).not.toBe(null);
        } finally {
            await pool.terminate();
        }
    });

    // -------------------------------------------------------------------------
    // SEC-08: WorkerPool task queue timeout starvation
    // -------------------------------------------------------------------------
    it('SEC-08: WorkerPool enforces timeout on tasks waiting in the queue for a busy worker', async () => {
        const workerScript = new URL('../../src/codec/carrier.worker.js', import.meta.url);
        const pool = new WorkerPool({
            workerScript,
            maxWorkers: 1
        });

        try {
            const t0 = Date.now();
            const sampleJpeg = fs.readFileSync(path.resolve('test/fixtures/sample vault/2560px-Beyond_the_horizon.jpg'));
            // Dispatch a large task that occupies worker 1
            const task1 = pool.dispatch('scan-capacity', { jpegBytes: sampleJpeg });

            // Immediately dispatch a second task with a short 30ms timeout while worker 1 is busy
            const [, err2] = await pool.dispatch('scan-capacity', { jpegBytes: new Uint8Array(10) }, { timeoutMs: 30 });
            const elapsed = Date.now() - t0;

            // Task 2 should time out at ~30ms while waiting in the queue, not wait for task 1 to finish
            expect(err2).not.toBe(null);
            expect(err2.message).toMatch(/timeout/i);
            expect(elapsed).toBeLessThan(150);

            await task1;
        } finally {
            await pool.terminate();
        }
    });

    // -------------------------------------------------------------------------
    // SEC-09: WorkerPool spawning concurrency race condition
    // -------------------------------------------------------------------------
    it('SEC-09: WorkerPool never spawns more than maxWorkers during concurrent dispatch burst', async () => {
        const workerScript = new URL('../../src/codec/carrier.worker.js', import.meta.url);
        const pool = new WorkerPool({
            workerScript,
            maxWorkers: 2
        });

        try {
            // Dispatch 6 tasks simultaneously while pool has 0 workers
            const dispatches = Array.from({ length: 6 }, () =>
                pool.dispatch('scan-capacity', { jpegBytes: new Uint8Array(10) })
            );

            await Promise.all(dispatches);

            // Under SEC-09 mitigation, pool must synchronously reserve worker slots to prevent spawning > maxWorkers
            expect(pool.workers.length).toBeLessThanOrEqual(2);
        } finally {
            await pool.terminate();
        }
    });

    // -------------------------------------------------------------------------
    // SEC-11: In-memory key retention and lack of zeroization
    // -------------------------------------------------------------------------
    it('SEC-11: PasswordVault does not expose master password or session keys as readable object properties', () => {
        const password = 'SuperSecretMasterPassword123!';
        const vault = new PasswordVault([], null, true, password);

        // Any main-world extension script with a reference to vault can access vault._unlock.password
        const unlockObj = vault._unlock;
        const exposedPassword = unlockObj ? unlockObj.password : undefined;

        // Under SEC-11 mitigation (REM-09), credentials must be stored in private class fields (#unlock)
        // or WeakMap closures, never exposed on vault._unlock
        expect(exposedPassword).toBe(undefined);
    });

    // -------------------------------------------------------------------------
    // SEC-12: SharedArrayBuffer, concurrency race conditions & memory safety
    // -------------------------------------------------------------------------
    it('SEC-12 (Invariant): Codebase strictly prohibits SharedArrayBuffer and Atomics', () => {
        const srcDir = path.resolve('src');
        const files = [];
        function collectFiles(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) collectFiles(full);
                else if (full.endsWith('.js')) files.push(full);
            }
        }
        collectFiles(srcDir);

        const violations = [];
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            if (/\bSharedArrayBuffer\b/.test(content)) violations.push(`${path.basename(file)}: SharedArrayBuffer`);
            if (/\bAtomics\b/.test(content)) violations.push(`${path.basename(file)}: Atomics`);
        }

        // SEC-12 confirmed clean design: 0 occurrences
        expect(violations.length).toBe(0);
    });
});
