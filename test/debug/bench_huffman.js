
import { HuffmanTable } from './src/core/decoder/huffman-parser.js';
import { BitReader } from './src/utils/bit-reader.js';

// Mock data for testing
// Standard luminance DC table (example)
const bits = new Uint8Array([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
const values = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const table = new HuffmanTable(bits, values, 0, 0);

// Create a large buffer with random data that mimics valid codes
// For simplicity, we'll just fill it with 0s and 1s, but we need valid codes to avoid errors.
// The shortest code is 2 bits (00). 
// Let's just fill with 0s, which might not be valid for all tables, but for this table:
// Code lengths:
// 2 bits: 1 code
// 3 bits: 5 codes
// ...
// Let's construct a valid stream of symbols.
// Symbol 0 is code 00 (2 bits)
// Symbol 1 is code 010 (3 bits)

// We'll just repeat symbol 0 (code 00) many times.
const numSymbols = 1000000;
const dataSize = Math.ceil(numSymbols * 2 / 8);
const data = new Uint8Array(dataSize);
// Fill with 0s implies code 00... wait.
// If code 00 is valid, then all zeros is a stream of symbol 0.
// Let's check the table construction.
// bits[1] = 1 (length 2).
// code starts at 0.
// length 1: count 0. code << 1 = 0.
// length 2: count 1. code << 1 = 0. symbol = values[0] = 0. code becomes 1.
// So code for symbol 0 is 00.
// Yes, a stream of zeros should be valid for symbol 0.

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
