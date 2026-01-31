import { Jsteg } from './src/core/steganography/jsteg.js';

const blocks = [];
for (let b = 0; b < 10; b++) {
    const block = new Int32Array(64);
    
    block[0] = 100; 
    block[1] = 5;
    block[2] = -3;
    block[3] = 2;
    block[4] = -1;
    block[5] = 1;
    block[6] = 0;
    block[7] = -2;
    
    for (let i = 8; i < 64; i++) {
        block[i] = (i % 7) - 3; 
    }
    blocks.push(block);
}

console.log('Original first block:', blocks[0].slice(0, 10));

const secretText = "Hello, World!";
const secretData = new TextEncoder().encode(secretText);
console.log('Secret data:', secretData);
console.log('Secret data length:', secretData.length);

const capacity = Jsteg.calculateCapacity(blocks);
console.log('Capacity:', capacity, 'bytes');

const success = Jsteg.embed(blocks, secretData);
console.log('Embed success:', success);
console.log('After embed first block:', blocks[0].slice(0, 10));

const extracted = Jsteg.extract(blocks);
console.log('Extracted:', extracted);
if (extracted) {
    const extractedText = new TextDecoder().decode(extracted);
    console.log('Extracted text:', extractedText);
    console.log('Match:', extractedText === secretText);
} else {
    console.log('Extraction failed!');
}
