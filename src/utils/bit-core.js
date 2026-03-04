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
    if (bitOffset === 0 && byteOffset + 1 < data.length) {
        const b0 = data[byteOffset];
        const b1 = data[byteOffset + 1];
        if (b0 !== 0xFF && b1 !== 0xFF) return [(b0 << 8) | b1, byteOffset, bitOffset, null];
    }

    if (byteOffset + 2 < data.length) {
        const b0 = data[byteOffset];
        const b1 = data[byteOffset + 1];
        const b2 = data[byteOffset + 2];
        if (b0 !== 0xFF && b1 !== 0xFF && b2 !== 0xFF) {
            const val = (b0 << 16) | (b1 << 8) | b2;
            return [((val << bitOffset) >> 8) & 0xFFFF, byteOffset, bitOffset, null];
        }
    }

    const remainingBytes = data.length - byteOffset;
    const remainingBits = (remainingBytes * 8) - bitOffset;
    if (remainingBits <= 0) return [0, byteOffset, bitOffset, null];

    const bitsToRead = Math.min(remainingBits, 16);
    const [val, , , err] = readBits(data, byteOffset, bitOffset, bitsToRead);
    if (err) return [0, byteOffset, bitOffset, null]; // peek16Bits traditionally swallows EOF for padding

    return [(val << (16 - bitsToRead)) & 0xFFFF, byteOffset, bitOffset, null];
}
