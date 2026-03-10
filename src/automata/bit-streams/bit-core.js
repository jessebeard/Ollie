/**
 * Pure functional core for Bit Reading operations.
 * Return tuple format: [value, newByteOffset, newBitOffset, error]
 */

export function handleByteStuffing(data, byteOffset) {
    if (byteOffset >= data.length) return [null, byteOffset, null]; // [marker, newByteOffset, error]

    let currentByte = data[byteOffset];
    let actualByteOffset = byteOffset;

    if (currentByte === 0x00 && actualByteOffset > 0 && data[actualByteOffset - 1] === 0xFF) {
        actualByteOffset++;
        if (actualByteOffset >= data.length) return [null, actualByteOffset, null];
        currentByte = data[actualByteOffset];
    }

    if (currentByte === 0xFF && actualByteOffset + 1 < data.length) {
        const nextByte = data[actualByteOffset + 1];
        if (nextByte === 0x00) {
            // Handled by subsequent reads
        } else if (nextByte >= 0xD0 && nextByte <= 0xD7) {
            return ['RESTART', actualByteOffset + 2, null];
        } else if (nextByte !== 0xFF) {
            const hex = nextByte.toString(16).padStart(2, '0').toUpperCase();
            return [null, actualByteOffset, new Error(`Unexpected marker: 0xFF${hex}`)];
        }
    }

    return [null, actualByteOffset, null];
}

export function readBit(data, byteOffset, bitOffset) {
    if (byteOffset >= data.length && bitOffset === 0) {
        return [null, byteOffset, bitOffset, new Error('Unexpected end of data')];
    }

    let bOff = byteOffset;
    let bitOff = bitOffset;

    if (bitOff === 0) {
        const [marker, nextBOff, err] = handleByteStuffing(data, bOff);
        if (err) return [null, bOff, bitOff, err];
        if (marker === 'RESTART') {
            bOff = nextBOff;
            bitOff = 0;
        } else {
            bOff = nextBOff;
        }
    }

    if (bOff >= data.length) return [null, bOff, bitOff, new Error('Unexpected end of data')];

    const currentByte = data[bOff];
    const bit = (currentByte >> (7 - bitOff)) & 1;

    bitOff++;
    if (bitOff === 8) {
        bitOff = 0;
        bOff++;
    }

    return [bit, bOff, bitOff, null];
}

export function readBits(data, byteOffset, bitOffset, length) {
    if (length < 1 || length > 16) {
        return [null, byteOffset, bitOffset, new Error(`Invalid bit length: ${length}. Must be 1-16.`)];
    }

    let value = 0;
    let bOff = byteOffset;
    let bitOff = bitOffset;

    for (let i = 0; i < length; i++) {
        const [bit, nextB, nextBit, err] = readBit(data, bOff, bitOff);
        if (err) return [null, bOff, bitOff, err];
        value = (value << 1) | bit;
        bOff = nextB;
        bitOff = nextBit;
    }
    return [value, bOff, bitOff, null];
}

export function peekBits(data, byteOffset, bitOffset, length) {
    const [val, , , err] = readBits(data, byteOffset, bitOffset, length);
    return [val, byteOffset, bitOffset, err];
}

export function peek16Bits(data, byteOffset, bitOffset) {
    // Fast path lookahead optimization for Huffman decoding
    let effectiveBOff = byteOffset;
    if (bitOffset === 0 && effectiveBOff > 0 && data[effectiveBOff - 1] === 0xFF && data[effectiveBOff] === 0x00) {
        effectiveBOff++;
    }

    if (bitOffset === 0 && effectiveBOff + 1 < data.length) {
        const b0 = data[effectiveBOff];
        const b1 = data[effectiveBOff + 1];
        if (b0 !== 0xFF && b1 !== 0xFF) return [(b0 << 8) | b1, byteOffset, bitOffset, null];
    }

    if (effectiveBOff + 2 < data.length) {
        const b0 = data[effectiveBOff];
        const b1 = data[effectiveBOff + 1];
        const b2 = data[effectiveBOff + 2];
        if (b0 !== 0xFF && b1 !== 0xFF && b2 !== 0xFF) {
            const val = (b0 << 16) | (b1 << 8) | b2;
            return [((val << bitOffset) >> 8) & 0xFFFF, byteOffset, bitOffset, null];
        }
    }

    let value = 0;
    let bOff = byteOffset;
    let bitOff = bitOffset;
    let bitsRead = 0;

    for (let i = 0; i < 16; i++) {
        const [bit, nextB, nextBit, err] = readBit(data, bOff, bitOff);
        if (err) {
            // EOF reached, pad remainder with 1s (standard JPEG byte-alignment padding)
            break;
        }
        value = (value << 1) | bit;
        bOff = nextB;
        bitOff = nextBit;
        bitsRead++;
    }

    if (bitsRead < 16) {
        const remaining = 16 - bitsRead;
        value = (value << remaining) | ((1 << remaining) - 1);
    }

    return [value & 0xFFFF, byteOffset, bitOffset, null];
}
