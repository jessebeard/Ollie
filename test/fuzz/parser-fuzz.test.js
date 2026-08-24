import { describe, it, expect } from '../utils/test-runner.js';

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

if (!isNode) {
    describe('Parser mutation fuzz (worker-isolated)', () => {
        it('Skipped in Browser', () => { expect(true).toBe(true); });
    });
} else {
    describe('Parser mutation fuzz (worker-isolated)', () => {
        it('every mutated JPEG terminates inside the timeout with a bounded outcome', async () => {
            const { runParserFuzz } = await import('../fuzz/parser-fuzz.mjs');
            await runParserFuzz(1);
            expect(true).toBe(true);
        });
    });
}
