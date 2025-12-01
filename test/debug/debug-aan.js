
import { idctAAN } from './src/core/decoder/idct.js';
import { forwardDCT } from './src/core/dct.js';

function test() {
    // Test 1: DC
    console.log('--- DC Test ---');
    const dcInput = new Float32Array(64);
    dcInput.fill(128);
    const dcCoeffs = forwardDCT(dcInput);
    console.log('DC Coeffs[0]:', dcCoeffs[0]);
    const dcOutput = idctAAN(dcCoeffs);
    console.log('DC Output[0]:', dcOutput[0]);
    console.log('Expected:', 128);

    // Test 2: AC (Nyquist x4)
    console.log('\n--- AC Test (x4) ---');
    const acInput = new Float32Array(64);
    // Create pattern that excites x4 (checkerboard-ish)
    for (let i = 0; i < 64; i++) acInput[i] = (i % 2 === 0) ? 144 : 112; // Average 128, +/- 16
    // Actually, x4 is high freq.
    // Let's just use forwardDCT to get coeffs for a known pattern
    const acCoeffs = forwardDCT(acInput);
    console.log('AC Coeffs (Non-zero):');
    for (let i = 0; i < 64; i++) {
        if (Math.abs(acCoeffs[i]) > 0.1) console.log(`  [${i}]: ${acCoeffs[i]}`);
    }
    const acOutput = idctAAN(acCoeffs);
    console.log('AC Output[0]:', acOutput[0]);
    console.log('AC Output[1]:', acOutput[1]);
    console.log('Expected[0]:', acInput[0]);
    console.log('Expected[1]:', acInput[1]);

    // Test 3: AC (x1)
    console.log('\n--- AC Test (x1) ---');
    const x1Input = new Float32Array(64);
    for (let x = 0; x < 8; x++) {
        const val = 128 + 50 * Math.cos((2 * x + 1) * 1 * Math.PI / 16);
        for (let y = 0; y < 8; y++) x1Input[y * 8 + x] = val;
    }
    const x1Coeffs = forwardDCT(x1Input);
    console.log('x1 Coeffs[1]:', x1Coeffs[1]);
    // Test 4: AC (x2)
    console.log('\n--- AC Test (x2) ---');
    const x2Input = new Float32Array(64);
    for (let x = 0; x < 8; x++) {
        const val = 128 + 50 * Math.cos((2 * x + 1) * 2 * Math.PI / 16);
        for (let y = 0; y < 8; y++) x2Input[y * 8 + x] = val;
    }
    const x2Coeffs = forwardDCT(x2Input);
    console.log('x2 Coeffs[2]:', x2Coeffs[2]);
    const x2Output = idctAAN(x2Coeffs);
    console.log('x2 Output[0]:', x2Output[0]);
    console.log('Expected[0]:', x2Input[0]);

    // Test 5: AC (x3)
    console.log('\n--- AC Test (x3) ---');
    const x3Input = new Float32Array(64);
    for (let x = 0; x < 8; x++) {
        const val = 128 + 50 * Math.cos((2 * x + 1) * 3 * Math.PI / 16);
        for (let y = 0; y < 8; y++) x3Input[y * 8 + x] = val;
    }
    const x3Coeffs = forwardDCT(x3Input);
    console.log('x3 Coeffs[3]:', x3Coeffs[3]);
    const x3Output = idctAAN(x3Coeffs);
    console.log('x3 Output[0]:', x3Output[0]);
    console.log('Expected[0]:', x3Input[0]);
    // Test 6: AC (x1 again)
    console.log('\n--- AC Test (x1 again) ---');
    const x1InputB = new Float32Array(64);
    for (let x = 0; x < 8; x++) {
        const val = 128 + 50 * Math.cos((2 * x + 1) * 1 * Math.PI / 16);
        for (let y = 0; y < 8; y++) x1InputB[y * 8 + x] = val;
    }
    const x1CoeffsB = forwardDCT(x1InputB);
    console.log('x1 Coeffs[1]:', x1CoeffsB[1]);
    const x1OutputB = idctAAN(x1CoeffsB);
    console.log('x1 Output[0]:', x1OutputB[0]);
    console.log('Expected[0]:', x1InputB[0]);

    // Test 7: AC (x7)
    console.log('\n--- AC Test (x7) ---');
    const x7Input = new Float32Array(64);
    for (let x = 0; x < 8; x++) {
        const val = 128 + 50 * Math.cos((2 * x + 1) * 7 * Math.PI / 16);
        for (let y = 0; y < 8; y++) x7Input[y * 8 + x] = val;
    }
    const x7Coeffs = forwardDCT(x7Input);
    console.log('x7 Coeffs[7]:', x7Coeffs[7]);
    const x7Output = idctAAN(x7Coeffs);
    console.log('x7 Output[0]:', x7Output[0]);
    console.log('Expected[0]:', x7Input[0]);
}

test();
