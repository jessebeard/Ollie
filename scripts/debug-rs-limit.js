
import { ReedSolomonEncoder, ReedSolomonDecoder, GenericGF_QR_CODE_FIELD_256 } from '../src/information-theory/error-correction/reedsolomon.js';

function testRS(dataSize, paritySize) {
    console.log(`Testing RS with Data: ${dataSize}, Parity: ${paritySize}, Total: ${dataSize + paritySize}`);
    const field = GenericGF_QR_CODE_FIELD_256;
    const encoder = new ReedSolomonEncoder(field);
    const decoder = new ReedSolomonDecoder(field);

    const totalSize = dataSize + paritySize;
    const data = new Int32Array(totalSize);

    // Fill data
    for (let i = 0; i < dataSize; i++) {
        data[i] = i % 256;
    }

    try {
        encoder.encode(data, paritySize);
        console.log('Encoding successful');
    } catch (e) {
        console.error('Encoding failed:', e.message);
        return;
    }

    // Introduce errors
    const errors = Math.floor(paritySize / 2);
    console.log(`Introducing ${errors} errors...`);
    for (let i = 0; i < errors; i++) {
        data[i] = (data[i] + 1) % 256;
    }

    try {
        decoder.decode(data, paritySize);
        console.log('Decoding successful');

        // Verify
        let correct = true;
        for (let i = 0; i < dataSize; i++) {
            if (data[i] !== i % 256) {
                correct = false;
                break;
            }
        }
        console.log('Data verification:', correct ? 'PASSED' : 'FAILED');
    } catch (e) {
        console.error('Decoding failed:', e.message);
    }
    console.log('---');
}

// Test 1: Small block (should pass)
testRS(10, 4);

// Test 2: Max block size (255 total)
testRS(251, 4);

// Test 3: Over limit (256 total)
testRS(252, 4);

// Test 4: Large payload (300 total)
testRS(296, 4);
