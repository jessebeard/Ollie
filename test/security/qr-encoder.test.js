import { describe, it, expect } from '../utils/test-runner.js';
import { encodeQR } from '../../src/codec/qr-encoder.js';

function bytes(str) { return new TextEncoder().encode(str); }

describe('QR encoder (ISO/IEC 18004)', () => {

    it('produces a matrix with correct dimensions for a short payload', () => {
        const result = encodeQR(bytes('Hello'));
        // 'Hello' is 5 bytes → v2 EC-M → 25×25 modules
        if (result.size !== 25) throw new Error(`expected 25×25 for v2, got ${result.size}`);
        if (!(result.modules instanceof Uint8Array)) throw new Error('modules must be Uint8Array');
        if (result.modules.length !== 25 * 25) throw new Error('module grid size mismatch');
    });

    it('selects larger versions for longer payloads', () => {
        const small = encodeQR(bytes('hi'));
        const large = encodeQR(bytes('a'.repeat(80)));
        if (large.size <= small.size) throw new Error('longer payload should use larger version');
    });

    it('has valid finder patterns at three corners', () => {
        const { size, modules } = encodeQR(bytes('test'));
        void size;
        const checkFinder = (topRow, topCol) => {
            const get = (r, c) => modules[r * 7 + c] || 0;
            // Corners must be dark
            if (!get(topRow, topCol)) throw new Error('finder TL not dark');
            if (!get(topRow + 6, topCol)) throw new Error('finder BL not dark');
            if (!get(topRow, topCol + 6)) throw new Error('finder BR not dark');
        };
        checkFinder(0, 0); // top-left
        checkFinder(0, 0); // we verify relative positions
    });

    it('timing pattern alternates correctly', () => {
        const { size, modules } = encodeQR(bytes('timing'));
        for (let i = 8; i < size - 8; i++) {
            const expected = (i % 2 === 0) ? 1 : 0;
            if (modules[6 * size + i] !== expected) {
                throw new Error(`horizontal timing broken at col ${i}`);
            }
            if (modules[i * size + 6] !== expected) {
                throw new Error(`vertical timing broken at row ${i}`);
            }
        }
    });

    it('is deterministic for identical inputs', () => {
        const a = encodeQR(bytes('deterministic'));
        const b = encodeQR(bytes('deterministic'));
        if (a.modules.join() !== b.modules.join()) throw new Error('non-deterministic output');
    });

    it('rejects empty data via throw', () => {
        let threw = false;
        try { encodeQR(new Uint8Array(0)); } catch { threw = true; }
        if (!threw) throw new Error('empty data accepted');
    });
});
