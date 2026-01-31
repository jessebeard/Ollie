
import { F5 } from '../src/core/steganography/f5.js';

function createBlocks(count, onesRatio) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const block = new Int32Array(64);
        for (let j = 1; j < 64; j++) {
            // Fill with 1s based on ratio, else 2s (non-shrinking) or 0s
            // For this test, we want to simulate usable coefficients.
            // Let's say 20% of ACs are non-zero.
            if (Math.random() < 0.2) {
                if (Math.random() < onesRatio) {
                    block[j] = Math.random() < 0.5 ? 1 : -1;
                } else {
                    block[j] = Math.random() < 0.5 ? 2 : -2;
                }
            } else {
                block[j] = 0;
            }
        }
        blocks.push(block);
    }
    return blocks;
}

async function runTest() {
    console.log('--- F5 Capacity Reproduction ---');

    // Simulate the user's scenario:
    // nonZero=140619, totalAC=816480
    // 816480 / 63 = 12960 blocks
    // 140619 / 816480 = 17.2% non-zero density

    const blockCount = 13000;
    // High ratio of 1s (common in photos)
    const onesRatio = 0.6;

    console.log(`Creating ${blockCount} blocks with ~${onesRatio * 100}% ones density among non-zeros...`);
    const blocks = createBlocks(blockCount, onesRatio);

    // Count actual stats
    let nonZero = 0;
    let ones = 0;
    for (const b of blocks) {
        for (let i = 1; i < 64; i++) {
            if (b[i] !== 0) {
                nonZero++;
                if (Math.abs(b[i]) === 1) ones++;
            }
        }
    }
    console.log(`Actual stats: NonZero=${nonZero}, Ones=${ones} (${(ones / nonZero * 100).toFixed(1)}%)`);

    // Calculate capacity
    const capacityBytes = F5.calculateCapacity(blocks, { format: 'container' });
    console.log(`Calculated Capacity: ${capacityBytes} bytes (${capacityBytes * 8} bits)`);

    // Try to embed that amount
    const data = new Uint8Array(capacityBytes);
    // Fill with random data
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);

    console.log(`Attempting to embed ${data.length} bytes...`);

    // Use container format to match user scenario
    const metadata = {};
    const result = await F5.embedContainer(blocks, data, metadata);

    if (result) {
        console.log('SUCCESS: Embedding succeeded.');
    } else {
        console.log('FAILURE: Embedding failed (likely ran out of coefficients).');
    }
}

runTest().catch(console.error);
