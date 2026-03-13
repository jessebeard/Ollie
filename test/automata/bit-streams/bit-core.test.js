import { describe, it, expect } from '../../utils/test-runner.js';
import {
    handleByteStuffing,
    readBit,
    readBits,
    peekBits,
    peek16Bits
} from '../../../src/automata/bit-streams/bit-core.js';

describe('BitCore', () => {
    describe('handleByteStuffing', () => {
        it('should handle normal bytes without stuffing', () => {
            const data = new Uint8Array([0x01, 0x02]);
            const [marker, bOff, err] = handleByteStuffing(data, 0);
            expect(marker).toBeNull();
            expect(bOff).toBe(0);
            expect(err).toBeNull();
        });

        it('should skip stuffed zero byte following 0xFF', () => {
            const data = new Uint8Array([0xFF, 0x00, 0x01]);
            // When we are at index 1 (the 0x00), and previous was 0xFF
            const [marker, bOff, err] = handleByteStuffing(data, 1);
            expect(marker).toBeNull();
            expect(bOff).toBe(2);
            expect(err).toBeNull();
        });

        it('should return RESTART marker for 0xFFD0-0xFFD7', () => {
            for (let i = 0; i <= 7; i++) {
                const markerByte = 0xD0 + i;
                const data = new Uint8Array([0xFF, markerByte]);
                const [marker, bOff, err] = handleByteStuffing(data, 0);
                expect(marker).toBe('RESTART');
                expect(bOff).toBe(2);
                expect(err).toBeNull();
            }
        });

        it('should return error for unexpected 0xFF markers', () => {
            const data = new Uint8Array([0xFF, 0x01]);
            const [marker, bOff, err] = handleByteStuffing(data, 0);
            expect(marker).toBeNull();
            expect(err).not.toBeNull();
            expect(err.message).toContain('Unexpected marker: 0xFF01');
        });

        it('should handle end of data', () => {
            const data = new Uint8Array([0x01]);
            const [marker, bOff, err] = handleByteStuffing(data, 1);
            expect(marker).toBeNull();
            expect(bOff).toBe(1);
            expect(err).toBeNull();
        });
    });

    describe('readBit', () => {
        it('should read bits from a byte', () => {
            const data = new Uint8Array([0b10101010]);
            let bOff = 0;
            let bitOff = 0;
            let results = [];

            for (let i = 0; i < 8; i++) {
                const [bit, nextB, nextBit, err] = readBit(data, bOff, bitOff);
                expect(err).toBeNull();
                results.push(bit);
                bOff = nextB;
                bitOff = nextBit;
            }

            expect(results).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
            expect(bOff).toBe(1);
            expect(bitOff).toBe(0);
        });

        it('should read across byte boundaries', () => {
            const data = new Uint8Array([0x80, 0x01]); // 10000000 00000001
            let [bit, bOff, bitOff, err] = readBit(data, 0, 7); // last bit of first byte
            expect(bit).toBe(0);
            expect(bOff).toBe(1);
            expect(bitOff).toBe(0);

            [bit, bOff, bitOff, err] = readBit(data, bOff, bitOff); // first bit of second byte
            expect(bit).toBe(0);
            expect(bOff).toBe(1);
            expect(bitOff).toBe(1);
        });

        it('should handle byte stuffing during bit reads', () => {
            const data = new Uint8Array([0xFF, 0x00, 0x80]);
            // read all bits of first byte (0xFF)
            let bOff = 0;
            let bitOff = 0;
            for (let i = 0; i < 8; i++) {
                const [bit, nextB, nextBit, err] = readBit(data, bOff, bitOff);
                expect(err).toBeNull();
                bOff = nextB;
                bitOff = nextBit;
            }
            // After 8 bits of 0xFF, bOff is 1, bitOff is 0.
            // The NEXT readBit(data, 1, 0) should trigger handleByteStuffing.
            expect(bOff).toBe(1);
            expect(bitOff).toBe(0);

            const [bit, nextB2, nextBit2, err2] = readBit(data, bOff, bitOff);
            expect(err2).toBeNull();
            expect(bit).toBe(1); // first bit of 0x80
            expect(nextB2).toBe(2);
            expect(nextBit2).toBe(1);
        });

        it('should handle RESTART marker during bit reads', () => {
            const data = new Uint8Array([0xFF, 0xD0, 0x80]);
            // If we try to read a bit at bitOffset 0, it calls handleByteStuffing
            const [bit, bOff, bitOff, err] = readBit(data, 0, 0);
            expect(err).toBeNull();
            expect(bit).toBe(1); // first bit of 0x80
            expect(bOff).toBe(2);
            expect(bitOff).toBe(1);
        });

        it('should return error at end of data', () => {
            const data = new Uint8Array([0x01]);
            const [bit, bOff, bitOff, err] = readBit(data, 1, 0);
            expect(err).not.toBeNull();
            expect(err.message).toBe('Unexpected end of data');
        });
    });

    describe('readBits', () => {
        it('should read multiple bits', () => {
            const data = new Uint8Array([0b11011011, 0b01010101]);
            const [val, bOff, bitOff, err] = readBits(data, 0, 0, 10);
            expect(err).toBeNull();
            expect(val).toBe(0b1101101101);
            expect(bOff).toBe(1);
            expect(bitOff).toBe(2);
        });

        it('should return error for invalid length', () => {
            const data = new Uint8Array([0x01]);
            const [, , , err1] = readBits(data, 0, 0, 0);
            expect(err1).not.toBeNull();
            const [, , , err2] = readBits(data, 0, 0, 17);
            expect(err2).not.toBeNull();
        });
    });

    describe('peekBits', () => {
        it('should peek bits without advancing offset', () => {
            const data = new Uint8Array([0b11011011, 0b01010101]);
            const [val, bOff, bitOff, err] = peekBits(data, 0, 0, 10);
            expect(err).toBeNull();
            expect(val).toBe(0b1101101101);
            expect(bOff).toBe(0);
            expect(bitOff).toBe(0);
        });
    });

    describe('peek16Bits', () => {
        it('should use fast path for no stuffing', () => {
            const data = new Uint8Array([0x12, 0x34, 0x56]);
            const [val, bOff, bitOff, err] = peek16Bits(data, 0, 0);
            expect(err).toBeNull();
            expect(val).toBe(0x1234);
            expect(bOff).toBe(0);
            expect(bitOff).toBe(0);
        });

        it('should handle stuffing in peek16Bits', () => {
            const data = new Uint8Array([0xFF, 0x00, 0x12, 0x34]);
            // If we are at byte 0, bit 0. It's not bitOffset 0 after 0xFF 0x00 yet.
            // Wait, the logic for peek16Bits has:
            // if (bitOffset === 0 && effectiveBOff > 0 && data[effectiveBOff - 1] === 0xFF && data[effectiveBOff] === 0x00) { effectiveBOff++; }

            // So if we are at the 0x00:
            const [val] = peek16Bits(data, 1, 0);
            expect(val).toBe(0x1234);
        });

        it('should handle EOF with padding 1s', () => {
            const data = new Uint8Array([0b10101010]);
            const [val] = peek16Bits(data, 0, 0);
            // 8 bits read: 10101010, then 8 bits padding: 11111111
            // 10101010 11111111 = 0xAAFF
            expect(val).toBe(0xAAFF);
        });
    });
});
