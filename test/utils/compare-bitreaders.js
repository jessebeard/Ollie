import { BitReaderNaive } from '../../src/utils/bit-reader-naive.js';
import { BitReaderOptimized } from '../../src/utils/bit-reader-optimized.js';

// Test with byte stuffing
const testData = new Uint8Array([
    0xFF, 0x00,  // Stuffed FF -> should read as FF
    0xAA,        // Should read as AA
    0xFF, 0x00,  // Stuffed FF -> should read as FF
    0xBB,        // Should read as BB
    0xCC         // Should read as CC
]);

console.log('Testing with data:', Array.from(testData).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
console.log('');

// Test naive
console.log('=== NAIVE ===');
const naive = new BitReaderNaive(new Uint8Array(testData));
const naiveResults = [];
try {
    for (let i = 0; i < 5; i++) {
        const byte = naive.readBits(8);
        naiveResults.push(byte);
        console.log(`Byte ${i}: 0x${byte.toString(16).padStart(2, '0')} (offset: ${naive.byteOffset}, bitOffset: ${naive.bitOffset})`);
    }
} catch (e) {
    console.log('Error:', e.message);
}

console.log('');

// Test optimized
console.log('=== OPTIMIZED ===');
const optimized = new BitReaderOptimized(new Uint8Array(testData));
const optimizedResults = [];
try {
    for (let i = 0; i < 5; i++) {
        const byte = optimized.readBits(8);
        optimizedResults.push(byte);
        console.log(`Byte ${i}: 0x${byte.toString(16).padStart(2, '0')} (offset: ${optimized.byteOffset}, bitOffset: ${optimized.bitOffset})`);
    }
} catch (e) {
    console.log('Error:', e.message);
}

console.log('');
console.log('=== COMPARISON ===');
console.log('Naive:     ', naiveResults.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
console.log('Optimized: ', optimizedResults.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
console.log('Match:', JSON.stringify(naiveResults) === JSON.stringify(optimizedResults) ? 'YES' : 'NO');
