import { BitReaderNaive } from '../../src/utils/bit-reader-naive.js';
import { BitReaderOptimized } from '../../src/utils/bit-reader-optimized.js';

// Test skipBits across stuffed bytes
const testData = new Uint8Array([
    0xFF, 0x00,  // Stuffed FF
    0xAA,
    0xBB,
    0xFF, 0x00,  // Stuffed FF
    0xCC
]);

console.log('Testing skipBits with data:', Array.from(testData).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
console.log('');

// Test 1: Skip 8 bits (should skip the FF, land at AA)
console.log('=== TEST 1: Skip 8 bits ===');
const n1 = new BitReaderNaive(new Uint8Array(testData));
const o1 = new BitReaderOptimized(new Uint8Array(testData));

n1.skipBits(8);
o1.skipBits(8);

const n1_byte = n1.readBits(8);
const o1_byte = o1.readBits(8);

console.log(`Naive:     0x${n1_byte.toString(16)} at offset ${n1.byteOffset}`);
console.log(`Optimized: 0x${o1_byte.toString(16)} at offset ${o1.byteOffset}`);
console.log(`Match: ${n1_byte === o1_byte ? 'YES' : 'NO'}`);
console.log('');

// Test 2: Skip 16 bits (should skip FF and AA, land at BB)
console.log('=== TEST 2: Skip 16 bits ===');
const n2 = new BitReaderNaive(new Uint8Array(testData));
const o2 = new BitReaderOptimized(new Uint8Array(testData));

n2.skipBits(16);
o2.skipBits(16);

const n2_byte = n2.readBits(8);
const o2_byte = o2.readBits(8);

console.log(`Naive:     0x${n2_byte.toString(16)} at offset ${n2.byteOffset}`);
console.log(`Optimized: 0x${o2_byte.toString(16)} at offset ${o2.byteOffset}`);
console.log(`Match: ${n2_byte === o2_byte ? 'YES' : 'NO'}`);
console.log('');

// Test 3: Skip 24 bits (should skip FF, AA, BB, land at second FF)
console.log('=== TEST 3: Skip 24 bits ===');
const n3 = new BitReaderNaive(new Uint8Array(testData));
const o3 = new BitReaderOptimized(new Uint8Array(testData));

n3.skipBits(24);
o3.skipBits(24);

const n3_byte = n3.readBits(8);
const o3_byte = o3.readBits(8);

console.log(`Naive:     0x${n3_byte.toString(16)} at offset ${n3.byteOffset}`);
console.log(`Optimized: 0x${o3_byte.toString(16)} at offset ${o3.byteOffset}`);
console.log(`Match: ${n3_byte === o3_byte ? 'YES' : 'NO'}`);
console.log('');

// Test 4: Read 4 bits, skip 12 bits (partial byte skip)
console.log('=== TEST 4: Read 4 bits, skip 12, read 4 ===');
const n4 = new BitReaderNaive(new Uint8Array(testData));
const o4 = new BitReaderOptimized(new Uint8Array(testData));

const n4_a = n4.readBits(4);
const o4_a = o4.readBits(4);
console.log(`After reading 4 bits: Naive=0x${n4_a.toString(16)}, Optimized=0x${o4_a.toString(16)}`);

n4.skipBits(12);
o4.skipBits(12);

const n4_b = n4.readBits(4);
const o4_b = o4.readBits(4);

console.log(`After skipping 12 bits then reading 4: Naive=0x${n4_b.toString(16)}, Optimized=0x${o4_b.toString(16)}`);
console.log(`Match: ${n4_b === o4_b ? 'YES' : 'NO'}`);
