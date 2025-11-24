import { JpegDecoder } from '../src/core/jpeg-decoder.js';
import { JpegEncoder } from '../src/core/jpeg-encoder.js';
import { assert } from './utils/assert.js';

export async function runComplianceTests() {
    console.log('Running Compliance Tests...');

    await testMarkerParsing();
    await testSpiffGenerationAndParsing();

    console.log('All Compliance Tests Passed!');
}

async function testMarkerParsing() {
    console.log('  Testing Marker Parsing...');

    // Create a minimal valid JPEG with JFIF
    const encoder = new JpegEncoder(50);
    const width = 16;
    const height = 16;
    const imageData = {
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4).fill(128)
    };

    const jpegBytes = encoder.encode(imageData);

    const decoder = new JpegDecoder();
    decoder.decode(jpegBytes);

    assert(decoder.jfif !== null, 'Should parse JFIF header');
    assert(decoder.jfif.version.major === 1, 'JFIF major version should be 1');
    assert(decoder.jfif.version.minor === 1, 'JFIF minor version should be 1');

    console.log('    JFIF parsing verified.');
}

async function testSpiffGenerationAndParsing() {
    console.log('  Testing SPIFF Generation and Parsing...');

    // Create a JPEG with SPIFF enabled
    const encoder = new JpegEncoder(50, { writeSpiff: true });
    const width = 16;
    const height = 16;
    const imageData = {
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4).fill(128)
    };

    const jpegBytes = encoder.encode(imageData);

    const decoder = new JpegDecoder();
    decoder.decode(jpegBytes);

    assert(decoder.spiff !== null, 'Should parse SPIFF header');
    assert(decoder.spiff.version.major === 1, 'SPIFF major version should be 1');
    assert(decoder.spiff.version.minor === 2, 'SPIFF minor version should be 2');
    assert(decoder.spiff.profileId === 1, 'SPIFF profile ID should be 1');
    assert(decoder.spiff.componentCount === 3, 'SPIFF component count should be 3');
    assert(decoder.spiff.height === height, `SPIFF height should be ${height}`);
    assert(decoder.spiff.width === width, `SPIFF width should be ${width}`);
    assert(decoder.spiff.colorSpace === 4, 'SPIFF color space should be 4 (YCbCr)');

    console.log('    SPIFF generation and parsing verified.');
}
