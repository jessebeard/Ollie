import { describe, it, expect } from '../../utils/test-runner.js';
import { F5 } from '../../../src/information-theory/steganography/f5-syndrome.js';
import { ErrorCorrection } from '../../../src/information-theory/error-correction/rs-interleaver.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import { Arbitrary } from '../../utils/pbt.js';

function createMockBlocks(count) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const block = new Int32Array(64);
        block[0] = 100;
        for (let c = 1; c < 64; c++) {
            block[c] = (c % 2 === 0) ? 3 : -3;
        }
        blocks.push(block);
    }
    return blocks;
}

describe('Result-Tuple Contracts', () => {

    it('F5.embedContainer resolves [true, null] on success', async () => {
        const blocks = createMockBlocks(600);
        const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

        const result = await F5.embedContainer(blocks, data, { ecc: false }, {});

        expect(Array.isArray(result)).toBe(true);
        expect(result[0]).toBe(true);
        expect(result[1]).toEqual(null);
    });

    it('F5.embedContainer resolves [null, Error] when data exceeds capacity', async () => {
        const blocks = createMockBlocks(600);
        const data = new Uint8Array(10000).fill(0xAB);

        const result = await F5.embedContainer(blocks, data, { ecc: false }, {});

        expect(Array.isArray(result)).toBe(true);
        expect(result[0]).toEqual(null);
        expect(result[1] instanceof Error).toBe(true);
    });

    it('ErrorCorrection.protect legacy mode returns a tuple', () => {
        const data = Arbitrary.byteArray(10, 100).generate();

        const result = ErrorCorrection.protect(data);

        expect(Array.isArray(result)).toBe(true);
        expect(result[1]).toEqual(null);
        expect(result[0] instanceof Uint8Array).toBe(true);
        expect(result[0].length).toBe(data.length + 4);
    });

    it('ErrorCorrection.recover legacy mode returns a tuple', () => {
        const data = Arbitrary.byteArray(10, 100).generate();
        const [encoded] = ErrorCorrection.protect(data);

        const result = ErrorCorrection.recover(encoded);

        expect(Array.isArray(result)).toBe(true);
        expect(result[1]).toEqual(null);
        expect(result[0] instanceof Uint8Array).toBe(true);
        expect(result[0].length).toBe(data.length);
    });
});

if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    describe('Result-Tuple Contracts (Node)', () => {
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

        it('PasswordVault.save resolves [null, Error] on embed failure instead of throwing', async () => {
            const entry = {
                title: 't',
                username: 'u',
                password: Arbitrary.string(8, 16).generate()
            };
            let vault = new PasswordVault([], null, true, 'test-password-123');
            const [added] = await vault.addEntry(entry);
            vault = added;

            const emptyImages = [];

            let saveOutcome = null;
            let threw = false;
            try {
                saveOutcome = await vault.save(emptyImages, 'test-password-123');
            } catch (e) {
                threw = true;
            }

            expect(threw).toBe(false);
            expect(Array.isArray(saveOutcome)).toBe(true);
            expect(saveOutcome[0]).toEqual(null);
            expect(saveOutcome[1] instanceof Error).toBe(true);
        });
    });
} else {
    describe('PasswordVault.save contract (Browser)', () => {
        it('Skipped in Browser (Node-only path)', () => {
            expect(true).toBe(true);
        });
    });
}
