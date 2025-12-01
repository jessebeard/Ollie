import { JpegEncoder } from './src/core/jpeg-encoder.js';
import { JpegDecoder } from './src/core/jpeg-decoder.js';
import { readFileSync } from 'fs';

// Create a simple test image
const width = 64;
const height = 64;
const imageData = new Uint8ClampedArray(width * height * 4);

// Create a gradient
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        imageData[idx] = x * 4;
        imageData[idx + 1] = y * 4;
        imageData[idx + 2] = 128;
        imageData[idx + 3] = 255;
    }
}

// Secret data
const secretText = "This is a secret message!";
const secretData = new TextEncoder().encode(secretText);

console.log('=== ENCODING ===');
console.log('Image size:', width, 'x', height);
console.log('Secret data length:', secretData.length, 'bytes');

// Encode with secret data
const encoder = new JpegEncoder(90, { secretData });
const jpegBytes = encoder.encode({ width, height, data: imageData });

console.log('JPEG size:', jpegBytes.length, 'bytes');

console.log('\n=== DECODING ===');

// Decode
const decoder = new JpegDecoder();
const result = decoder.decode(jpegBytes);

console.log('Decoded image size:', result.width, 'x', result.height);
console.log('Secret data extracted:', result.secretData ? 'YES' : 'NO');

if (result.secretData) {
    const extractedText = new TextDecoder().decode(result.secretData);
    console.log('Extracted length:', result.secretData.length, 'bytes');
    console.log('Extracted text:', extractedText);
    console.log('Match:', extractedText === secretText);
} else {
    console.log('ERROR: No secret data extracted!');
}
