import { describe, it, expect } from '../utils/test-runner.js';
import { DropZone } from '../../app/components/vault/components/drop-zone.js';

/**
 * Regression tests for folder/multi-item drops.
 *
 * Browser contract: the DataTransferItemList backing a drop event is tied
 * to the drag data store, which Chrome tears down once the event handler's
 * synchronous portion ends. Handle/entry acquisition MUST therefore be
 * initiated synchronously for every item before the first await yields.
 */

function makeFileHandle(name) {
    return {
        kind: 'file',
        name,
        getFile: async () => ({ name })
    };
}

function makeDirHandle(name, children) {
    return {
        kind: 'directory',
        name,
        values() {
            return (async function* () {
                for (const child of children) {
                    yield child;
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            })();
        }
    };
}

function makeDropEvent(itemsSpec) {
    let cleared = false;
    const raw = [];
    const callLog = [];

    itemsSpec.forEach((spec, i) => {
        const item = { kind: 'file' };
        if (typeof spec.handle !== 'undefined') {
            item.getAsFileSystemHandle = () => {
                if (cleared) throw new Error('drag data store cleared');
                callLog.push(i);
                return new Promise(resolve => setTimeout(() => resolve(spec.handle), 0));
            };
        }
        if (typeof spec.entry !== 'undefined') {
            item.webkitGetAsEntry = () => {
                if (cleared) throw new Error('drag data store cleared');
                callLog.push(i);
                return spec.entry;
            };
        }
        raw.push(item);
    });

    const items = {};
    Object.defineProperty(items, 'length', {
        get() { return cleared ? 0 : raw.length; }
    });
    for (let i = 0; i < raw.length; i++) {
        Object.defineProperty(items, i, {
            get() {
                if (cleared) throw new Error('drag data store cleared');
                return raw[i];
            }
        });
    }

    const armClearTimer = () => {
        setTimeout(() => { cleared = true; }, 0);
    };

    return { items, callLog, armClearTimer };
}

function instantiate(onFilesDropped) {
    const dz = Object.create(DropZone.prototype);
    dz.element = null;
    dz.isDragging = false;
    dz.onFilesDropped = onFilesDropped;
    dz.unhighlight = () => {};
    return dz;
}

describe('DropZone folder and multi-item drops', () => {

    it('initiates handle acquisition synchronously for every item before first await', async () => {
        const dirA = makeDirHandle('dirA', [makeFileHandle('a1.jpg'), makeFileHandle('a2.txt')]);
        const dirB = makeDirHandle('dirB', [makeFileHandle('b1.jpg')]);
        const loose = makeFileHandle('loose.jpg');

        const ev = makeDropEvent([
            { handle: dirA },
            { handle: dirB },
            { handle: loose }
        ]);

        let received;
        const dz = instantiate((files) => { received = files; });

        ev.armClearTimer();
        await dz.handleDrop({ dataTransfer: { items: ev.items } });

        expect(ev.callLog.length).toBe(3);
        expect(received.map(f => f.name)).toEqual(['a1.jpg', 'b1.jpg', 'loose.jpg']);
    });

    it('recovers all JPEGs from nested directories across modern and legacy APIs', async () => {
        const nested = makeDirHandle('nested', [
            makeDirHandle('inner', [makeFileHandle('deep.jpg')])
        ]);
        const entry = {
            isFile: true,
            name: 'legacy.JPG',
            file: (ok) => setTimeout(() => ok({ name: 'legacy.JPG' }), 0)
        };

        const ev = makeDropEvent([
            { handle: nested },
            { entry }
        ]);

        let received;
        const dz = instantiate((files) => { received = files; });

        await dz.handleDrop({ dataTransfer: { items: ev.items } });

        expect(received.map(f => f.name)).toEqual(['deep.jpg', 'legacy.JPG']);
    });

    it('returns deterministic name-sorted order regardless of traversal timing', async () => {
        const fast = makeDirHandle('fast', [makeFileHandle('zeta.jpg')]);
        const slowChildren = [makeFileHandle('alpha.jpg')];
        const slow = makeDirHandle('slow', slowChildren);

        const ev = makeDropEvent([{ handle: fast }, { handle: slow }]);
        let received;
        const dz = instantiate((files) => { received = files; });

        await dz.handleDrop({ dataTransfer: { items: ev.items } });

        expect(received.map(f => f.name)).toEqual(['alpha.jpg', 'zeta.jpg']);
    });

    it('invokes callback with empty list when nothing matches, surfacing zero-match state', async () => {
        const pngOnly = makeDirHandle('pngs', [makeFileHandle('photo.png'), makeFileHandle('clip.webp')]);

        const ev = makeDropEvent([{ handle: pngOnly }]);
        let received;
        let receivedErrors;
        const dz = instantiate((files, errors) => { received = files; receivedErrors = errors; });

        await dz.handleDrop({ dataTransfer: { items: ev.items } });

        expect(received.length).toBe(0);
        expect(receivedErrors.length).toBe(0);
    });

    it('skips unreadable subtrees but keeps siblings and reports the error', async () => {
        const denied = makeDirHandle('denied', []);
        denied.values = () => (async function* () { throw new Error('permission denied'); })();

        const healthy = makeDirHandle('healthy', [makeFileHandle('good.jpg')]);

        const ev = makeDropEvent([{ handle: denied }, { handle: healthy }]);
        let received;
        let receivedErrors;
        const dz = instantiate((files, errors) => { received = files; receivedErrors = errors; });

        await dz.handleDrop({ dataTransfer: { items: ev.items } });

        expect(received.map(f => f.name)).toEqual(['good.jpg']);
        expect(receivedErrors.length).toBe(1);
        expect(receivedErrors[0].message).toBe('permission denied');
    });

    it('terminates on pathological self-referencing directory trees', async () => {
        const cycle = makeDirHandle('cycle', []);
        cycle.values = function* () { yield cycle; };

        const ev = makeDropEvent([{ handle: cycle }]);
        let received;
        const dz = instantiate((files) => { received = files; });

        await dz.handleDrop({ dataTransfer: { items: ev.items } });

        expect(received.length).toBe(0);
    });

    it('ignores non-file drag payloads like text or links', async () => {
        let cleared = false;
        const items = {};
        Object.defineProperty(items, 'length', { get() { return cleared ? 0 : 1; } });
        items[0] = { kind: 'string' };

        let received;
        const dz = instantiate((files) => { received = files; });

        setTimeout(() => { cleared = true; }, 0);
        await dz.handleDrop({ dataTransfer: { items } });

        expect(received.length).toBe(0);
    });
});
