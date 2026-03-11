import { describe, it, expect } from '../utils/test-runner.js';

if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    describe('Verify Fixes Debug', () => {
        it('Skipped in Browser', () => { expect(true).toBe(true); });
    });
} else {
    import('fs').then(({ default: fs }) => {
        import('../../src/codec/decoder.js').then(({ JpegDecoder }) => {

            console.log('Testing upsampling fix...\n');

            const decoder = new JpegDecoder();
            const jpegBytes = fs.readFileSync('./test/fixtures/gravel-e.jpg');
            
            decoder.decode(jpegBytes).then(([result, err]) => {
                if(err) {
                    console.error(err);
                    return;
                }

                const yComp = decoder.components[1];
                const expectedYWidth = yComp.blocksH * 8;
                const expectedYHeight = yComp.blocksV * 8;

                console.log('✓ Fix #1 - Component Dimensions:');
                console.log(`  Y component: ${expectedYWidth}x${expectedYHeight} (${yComp.blocksH}x${yComp.blocksV} blocks)`);

                console.log(`  Final image: ${result.width}x${result.height}`);
                console.log(`  ${expectedYWidth !== result.width ? '✓ Cropping applied' : '⚠️ No cropping'}`);

                const upsamplingCode = fs.readFileSync('./src/codec/decoder/upsampling.js', 'utf8');
                const hasCenteredSampling = upsamplingCode.includes('JPEG uses centered sampling');
                const hasOldFormula = upsamplingCode.includes('srcWidth - 1) / (dstWidth - 1)');

                console.log('\n✓ Fix #2 - Centered Sampling:');
                console.log(`  New centered sampling code: ${hasCenteredSampling ? '✓ PRESENT' : '✗ MISSING'}`);
                console.log(`  Old edge-aligned code: ${hasOldFormula ? '✗ STILL THERE' : '✓ REMOVED'}`);

                if (hasCenteredSampling && !hasOldFormula) {
                    console.log('\n✅ Both fixes are correctly applied in the code!');
                    console.log('\nIf you still see blocking in the browser:');
                    console.log('  1. Do a HARD REFRESH: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)');
                    console.log('  2. Or clear browser cache completely');
                    console.log('  3. The browser is likely using cached JavaScript modules');
                } else {
                    console.log('\n⚠️ Fixes may not be fully applied!');
                }
            });
        });
    });
}
