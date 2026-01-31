
import { HuffmanTable } from './src/core/decoder/huffman-parser.js';
import { BitReader } from './src/utils/bit-reader.js';

const bits = new Uint8Array([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
const values = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const table = new HuffmanTable(bits, values, 0, 0);

const numSymbols = 1000000;
const dataSize = Math.ceil(numSymbols * 2 / 8);
const data = new Uint8Array(dataSize);

const bitReader = new BitReader(data);

console.log('Starting benchmark...');
const start = Date.now();

try {
    for (let i = 0; i < numSymbols; i++) {
        if (bitReader.isEOF()) break;
        table.decode(bitReader);
    }
} catch (e) {
    console.error('Error during decoding:', e);
}

const end = Date.now();
console.log(`Decoded ${numSymbols} symbols in ${(end - start).toFixed(2)}ms`);
console.log(`Average time per symbol: ${((end - start) / numSymbols).toFixed(6)}ms`);
