import { describe, it, expect } from '../utils/test-runner.js';
import { writeAllWithRollback } from '../../src/utils/atomic-writer.js';

function makeHandle(name, store) {
    return {
        name,
        async createWritable() {
            const chunks = [];
            return {
                async write(data) {
                    if (store.failOn && store.failOn.has(name)) {
                        throw new Error(`disk full on ${name}`);
                    }
                    chunks.push(Uint8Array.from(data));
                },
                async close() {
                    if (store.failOnClose && store.failOnClose.has(name)) {
                        throw new Error(`close failed on ${name}`);
                    }
                    store.written.set(name, chunks);
                }
            };
        }
    };
}

function bytes(str) {
    return new TextEncoder().encode(str);
}

describe('atomic-writer (save rollback core)', () => {

    it('writes every target and reports success', async () => {
        const store = { written: new Map() };
        const handles = [makeHandle('a.jpg', store), makeHandle('b.jpg', store)];
        const originals = new Map([['a.jpg', bytes('old-a')], ['b.jpg', bytes('old-b')]]);

        const [written, err] = await writeAllWithRollback(
            [{ handle: handles[0], data: bytes('new-a') }, { handle: handles[1], data: bytes('new-b') }],
            originals
        );

        expect(err).toBe(null);
        expect(written).toEqual(['a.jpg', 'b.jpg']);
        expect(store.written.get('a.jpg')[0]).toEqual(bytes('new-a'));
        expect(store.written.get('b.jpg')[0]).toEqual(bytes('new-b'));
    });

    it('restores already-written files when a later write fails', async () => {
        const store = { written: new Map(), failOn: new Set(['c.jpg']) };
        const handles = [
            makeHandle('a.jpg', store),
            makeHandle('b.jpg', store),
            makeHandle('c.jpg', store)
        ];
        const originals = new Map([
            ['a.jpg', bytes('orig-a')],
            ['b.jpg', bytes('orig-b')],
            ['c.jpg', bytes('orig-c')]
        ]);

        const [written, err] = await writeAllWithRollback(
            [
                { handle: handles[0], data: bytes('mutated-a') },
                { handle: handles[1], data: bytes('mutated-b') },
                { handle: handles[2], data: bytes('mutated-c') }
            ],
            originals
        );

        expect(written).toBe(null);
        if (!(err instanceof Error)) throw new Error('expected an error tuple');
        expect(err.message).toContain('disk full on c.jpg');
        expect(err.message).toContain('All 2 modified file(s) were restored');

        // a and b were mutated then restored to their original content
        const restoredA = store.written.get('a.jpg');
        const restoredB = store.written.get('b.jpg');
        expect(restoredA[restoredA.length - 1]).toEqual(bytes('orig-a'));
        expect(restoredB[restoredB.length - 1]).toEqual(bytes('orig-b'));
        // c was never written
        expect(store.written.has('c.jpg')).toBe(false);
    });

    it('reports which restorations failed instead of masking them', async () => {
        const calls = [];
        const goodOriginal = new Map([['x.jpg', bytes('orig-x')]]);
        const flakyHandle = {
            name: 'x.jpg',
            async createWritable() {
                let call = 0;
                return {
                    async write(data) {
                        call++;
                        calls.push(call);
                        if (calls.length === 2) throw new Error('restore blew up');
                    },
                    async close() { }
                };
            }
        };
        const okHandle = {
            name: 'y.jpg',
            async createWritable() {
                return {
                    async write() { throw new Error('boom'); },
                    async close() { }
                };
            }
        };

        const [, err] = await writeAllWithRollback(
            [{ handle: flakyHandle, data: bytes('n1') }, { handle: okHandle, data: bytes('n2') }],
            goodOriginal
        );

        if (!(err instanceof Error)) throw new Error('expected an error tuple');
        expect(err.message).toContain('Rollback FAILED');
        expect(err.message).toContain('boom');
    });
});
