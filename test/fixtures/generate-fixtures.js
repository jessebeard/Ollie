/**
 * Generate test JPEG fixtures for decoder testing
 * Run with: node test/fixtures/generate-fixtures.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create minimal test images as ImageData-like objects
 */

// 8x8 solid black image
function createSolidBlack() {
    const width = 8, height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    // All zeros (black), alpha = 255
    for (let i = 3; i < data.length; i += 4) {
        data[i] = 255;
    }
    return { width, height, data };
}

// 8x8 solid white image
function createSolidWhite() {
    const width = 8, height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A
    }
    return { width, height, data };
}

// 8x8 solid red image
function createSolidRed() {
    const width = 8, height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;     // R
        data[i + 1] = 0;   // G
        data[i + 2] = 0;   // B
        data[i + 3] = 255; // A
    }
    return { width, height, data };
}

// 8x8 checkerboard pattern
function createCheckerboard() {
    const width = 8, height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const isWhite = (x + y) % 2 === 0;
            const value = isWhite ? 255 : 0;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
            data[i + 3] = 255;
        }
    }
    return { width, height, data };
}

// 16x16 gradient (horizontal)
function createGradient() {
    const width = 16, height = 16;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const value = Math.floor((x / (width - 1)) * 255);
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
            data[i + 3] = 255;
        }
    }
    return { width, height, data };
}

// 24x24 color blocks (RGB)
function createColorBlocks() {
    const width = 24, height = 24;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            // Divide into 3x3 grid of 8x8 blocks
            const blockX = Math.floor(x / 8);
            const blockY = Math.floor(y / 8);

            if (blockX === 0 && blockY === 0) {
                // Red
                data[i] = 255; data[i + 1] = 0; data[i + 2] = 0;
            } else if (blockX === 1 && blockY === 0) {
                // Green
                data[i] = 0; data[i + 1] = 255; data[i + 2] = 0;
            } else if (blockX === 2 && blockY === 0) {
                // Blue
                data[i] = 0; data[i + 1] = 0; data[i + 2] = 255;
            } else if (blockX === 0 && blockY === 1) {
                // Yellow
                data[i] = 255; data[i + 1] = 255; data[i + 2] = 0;
            } else if (blockX === 1 && blockY === 1) {
                // Cyan
                data[i] = 0; data[i + 1] = 255; data[i + 2] = 255;
            } else if (blockX === 2 && blockY === 1) {
                // Magenta
                data[i] = 255; data[i + 1] = 0; data[i + 2] = 255;
            } else {
                // White
                data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
            }
            data[i + 3] = 255;
        }
    }
    return { width, height, data };
}

/**
 * Generate fixtures
 */
async function generateFixtures() {
    console.log('Generating JPEG test fixtures...\n');

    // Import encoder
    const { JpegEncoder } = await import('../../src/jpeg-encoder.js');

    const fixtures = [
        { name: 'solid-black-8x8', image: createSolidBlack(), quality: 50 },
        { name: 'solid-white-8x8', image: createSolidWhite(), quality: 50 },
        { name: 'solid-red-8x8', image: createSolidRed(), quality: 50 },
        { name: 'checkerboard-8x8', image: createCheckerboard(), quality: 50 },
        { name: 'gradient-16x16', image: createGradient(), quality: 50 },
        { name: 'color-blocks-24x24', image: createColorBlocks(), quality: 50 },
        // Different quality levels
        { name: 'checkerboard-8x8-q10', image: createCheckerboard(), quality: 10 },
        { name: 'checkerboard-8x8-q90', image: createCheckerboard(), quality: 90 },
    ];

    for (const fixture of fixtures) {
        try {
            const encoder = new JpegEncoder(fixture.quality);
            const jpegBytes = encoder.encode(fixture.image);

            const filename = `${fixture.name}.jpg`;
            const filepath = path.join(__dirname, filename);

            fs.writeFileSync(filepath, Buffer.from(jpegBytes));
            console.log(`✓ Generated ${filename} (${jpegBytes.length} bytes)`);
        } catch (error) {
            console.error(`✗ Failed to generate ${fixture.name}:`, error.message);
        }
    }

    // Also create a README
    const readme = `# JPEG Test Fixtures

This directory contains test JPEG files for decoder testing.

## Files

- **solid-black-8x8.jpg** - 8x8 solid black image
- **solid-white-8x8.jpg** - 8x8 solid white image
- **solid-red-8x8.jpg** - 8x8 solid red image
- **checkerboard-8x8.jpg** - 8x8 checkerboard pattern
- **gradient-16x16.jpg** - 16x16 horizontal gradient
- **color-blocks-24x24.jpg** - 24x24 color blocks (RGB primaries + secondaries)
- **checkerboard-8x8-q10.jpg** - Low quality (10)
- **checkerboard-8x8-q90.jpg** - High quality (90)

## Generation

These fixtures are generated by the encoder to ensure roundtrip compatibility.

To regenerate: \`node test/fixtures/generate-fixtures.js\`
`;

    fs.writeFileSync(path.join(__dirname, 'README.md'), readme);
    console.log('\n✓ Generated README.md');
    console.log('\nAll fixtures generated successfully!');
}

generateFixtures().catch(err => {
    console.error('Error generating fixtures:', err);
    process.exit(1);
});
