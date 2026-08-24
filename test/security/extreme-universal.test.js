import { describe, it, expect } from '../utils/test-runner.js';
import { F5 } from '../../src/information-theory/steganography/f5-syndrome.js';
import {
    decodeControlCodeword,
    unpackControlHeader
} from '../../src/information-theory/steganography/coded-header.js';

function createMockBlocks(count) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const b = new Int32Array(64);
        b[0] = 100;
        for (let c = 1; c < 64; c++) b[c] = (c % 2 === 0) ? 5 : -5;
        blocks.push(b);
    }
    return blocks;
}

function scanControl(blocks, seed) {
    for (let k = 1; k <= 4; k++) {
        const head = F5.extractRaw(blocks, 255 * 8, { seed, k });
        if (!head) continue;
        const [plane] = decodeControlCodeword(head);
        if (!plane) continue;
        const [ctl, err] = unpackControlHeader(plane);
        if (err || !ctl || ctl.magic !== 'F5SG') continue;
        return ctl;
    }
    return null;
}

describe('Extreme ECC universal (Wave N)', () => {

    it('always resolves to Extreme regardless of passed eccProfile', async () => {
        for (const profile of ['Low', 'Medium', 'High', 'Ultra', 'Extreme']) {
            const blocks = createMockBlocks(140);
            const [ok] = await F5.embedContainer(
                blocks, new Uint8Array([1, 2, 3]),
                { filename: 't.bin', eccProfile: profile },
                { seed: 'extreme-' + profile }
            );
            if (!ok) throw new Error(`embed failed with profile ${profile}`);
            const ctl = scanControl(blocks, 'extreme-' + profile);
            if (!ctl) throw new Error('no control header found');
            if (ctl.profileName !== 'Extreme') {
                throw new Error(`profile ${profile} resolved to ${ctl.profileName}`);
            }
        }
    });

    it('resolves to Extreme even when metadata.ecc is false', async () => {
        const blocks = createMockBlocks(140);
        await F5.embedContainer(blocks, new Uint8Array([1]), { filename: 'x', ecc: false }, { seed: 'no-ecc' });
        const ctl = scanControl(blocks, 'no-ecc');
        if (!ctl) throw new Error('no control header');
        if (ctl.profileName !== 'Extreme') throw new Error('ecc:false still not Extreme');
    });

    it('does not write ecc fields into the metadata JSON', async () => {
        const blocks = createMockBlocks(200);
        await F5.embedContainer(blocks, new TextEncoder().encode('data'), { filename: 'test' }, { seed: 'slim' });
        const ctl = scanControl(blocks, 'slim');
        if (!ctl) throw new Error('no control header');

        const bodyCodedLen = ctl.blockCount * 255;
        const full = F5.extractRaw(blocks, (255 + bodyCodedLen) * 8, { seed: 'slim', k: ctl.k });
        const bodyCoded = full.slice(255);
        const { ErrorCorrection } = await import('../../src/information-theory/error-correction/rs-interleaver.js');
        const [body] = ErrorCorrection.recover(bodyCoded, ctl.profileName, ctl.originalLength, ctl.blockCount);

        const metaJson = JSON.parse(new TextDecoder().decode(body.slice(0, ctl.metaLen)));
        for (const key of ['ecc', 'eccProfile']) {
            if (key in metaJson) throw new Error(`metadata JSON contains stale key "${key}"`);
        }
    });
});
