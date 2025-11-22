import { describe, it, expect } from '../utils/test-runner.js';
import { BitReader } from '../../src/utils/bit-reader.js';

describe('BitReader', () => {
    it('should read single bits correctly', () => {
        // 0b10110011 = 0xB3
        const data = new Uint8Array([0xB3]);
        const reader = new BitReader(data);

        expect(reader.readBit()).toBe(1);
        expect(reader.readBit()).toBe(0);
        expect(reader.readBit()).toBe(1);
        expect(reader.readBit()).toBe(1);
        expect(reader.readBit()).toBe(0);
        expect(reader.readBit()).toBe(0);
        expect(reader.readBit()).toBe(1);
        expect(reader.readBit()).toBe(1);
    });

    it('should read multi-bit sequences (1-16 bits)', () => {
        // 0b10110011 11001010 = 0xB3CA
        const data = new Uint8Array([0xB3, 0xCA]);
        const reader = new BitReader(data);

        expect(reader.readBits(4)).toBe(0b1011); // First 4 bits
        expect(reader.readBits(8)).toBe(0b00111100); // Next 8 bits
        expect(reader.readBits(4)).toBe(0b1010); // Last 4 bits
    });

    it('should handle byte boundaries correctly', () => {
        const data = new Uint8Array([0xAB, 0xCD]);
        const reader = new BitReader(data);

        // Read first byte
        expect(reader.readBits(8)).toBe(0xAB);
        // Read second byte
        expect(reader.readBits(8)).toBe(0xCD);
    });

    it('should handle byte stuffing (0xFF 0x00 -> 0xFF)', () => {
        // 0xFF 0x00 should be interpreted as 0xFF (stuffed byte)
        const data = new Uint8Array([0xFF, 0x00, 0xAA]);
        const reader = new BitReader(data);

        expect(reader.readBits(8)).toBe(0xFF);
        expect(reader.readBits(8)).toBe(0xAA);
    });

    it('should detect restart markers (0xFFD0-0xFFD7)', () => {
        const data = new Uint8Array([0xAA, 0xFF, 0xD0, 0xBB]);
        const reader = new BitReader(data);

        expect(reader.readBits(8)).toBe(0xAA);
        // Restart marker should be skipped
        expect(reader.readBits(8)).toBe(0xBB);
    });

    it('should throw error on unexpected markers', () => {
        const data = new Uint8Array([0xAA, 0xFF, 0xD9]); // EOI marker
        const reader = new BitReader(data);

        expect(reader.readBits(8)).toBe(0xAA);

        let errorThrown = false;
        try {
            reader.readBits(8);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Unexpected marker: 0xFFD9');
        }
        expect(errorThrown).toBe(true);
    });

    it('should track bit position accurately', () => {
        const data = new Uint8Array([0xAA, 0xBB]);
        const reader = new BitReader(data);

        expect(reader.getPosition()).toEqual({ byteOffset: 0, bitOffset: 0 });

        reader.readBits(4);
        expect(reader.getPosition()).toEqual({ byteOffset: 0, bitOffset: 4 });

        reader.readBits(4);
        expect(reader.getPosition()).toEqual({ byteOffset: 1, bitOffset: 0 });
    });

    it('should peek bits without consuming them', () => {
        const data = new Uint8Array([0xB3]);
        const reader = new BitReader(data);

        expect(reader.peekBits(4)).toBe(0b1011);
        expect(reader.peekBits(4)).toBe(0b1011); // Should still be the same
        expect(reader.readBits(4)).toBe(0b1011); // Now consume
        expect(reader.peekBits(4)).toBe(0b0011); // Next 4 bits
    });

    it('should align to byte boundary', () => {
        const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
        const reader = new BitReader(data);

        reader.readBits(3); // Read 3 bits
        expect(reader.getPosition()).toEqual({ byteOffset: 0, bitOffset: 3 });

        reader.alignToByte();
        expect(reader.getPosition()).toEqual({ byteOffset: 1, bitOffset: 0 });

        expect(reader.readBits(8)).toBe(0xBB);
    });

    it('should detect end of file', () => {
        const data = new Uint8Array([0xAA]);
        const reader = new BitReader(data);

        expect(reader.isEOF()).toBe(false);
        reader.readBits(8);
        expect(reader.isEOF()).toBe(true);
    });

    it('should throw error when reading past end', () => {
        const data = new Uint8Array([0xAA]);
        const reader = new BitReader(data);

        reader.readBits(8);

        let errorThrown = false;
        try {
            reader.readBits(8);
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Unexpected end of data');
        }
        expect(errorThrown).toBe(true);
    });

    it('should handle reading across multiple bytes', () => {
        // Test reading bits that span byte boundaries
        const data = new Uint8Array([0b11110000, 0b10101010]);
        const reader = new BitReader(data);

        expect(reader.readBits(4)).toBe(0b1111);
        expect(reader.readBits(8)).toBe(0b00001010); // Spans boundary
        expect(reader.readBits(4)).toBe(0b1010);
    });

    it('should validate bit length parameter', () => {
        const data = new Uint8Array([0xAA]);
        const reader = new BitReader(data);

        let errorThrown = false;
        try {
            reader.readBits(17); // Too many bits
        } catch (e) {
            errorThrown = true;
            expect(e.message).toBe('Invalid bit length: 17. Must be 1-16.');
        }
        expect(errorThrown).toBe(true);
    });
});
