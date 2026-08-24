import { F5 } from './src/information-theory/steganography/f5-syndrome.js';
import { decodeControlCodeword, unpackControlHeader } from './src/information-theory/steganography/coded-header.js';
import { ErrorCorrection } from './src/information-theory/error-correction/rs-interleaver.js';

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

const payload = new TextEncoder().encode('CONTAINER-PAYLOAD-0123456789ABCDEF');
const metadataObj = {};
const [ok, embErr] = await F5.embedContainer(blocks(), payload, metadataObj, { seed: 'conformance-container' });
function blocks() { return createMockBlocks(140); }
if (!ok) { console.log('embed err', embErr); process.exit(1); }

// Re-embed into fresh blocks and corrupt body region
const blocks2 = createMockBlocks(140);
const [ok2] = await F5.embedContainer(blocks2, payload, { ...metadataObj }, { seed: 'conformance-container' });
console.log('embed2:', ok2);

// Extract frame
for (let k = 1; k <= 4; k++) {
    const head = F5.extractRaw(blocks2, 255 * 8, { seed: 'conformance-container', k });
    if (!head) continue;
    const [plane] = decodeControlCodeword(head);
    if (!plane) continue;
    const ctl = unpackControlHeader(plane)[0];
    if (!ctl || ctl.magic !== 'F5SG') continue;
    console.log(`k=${k} ctl ok, blockCount=${ctl.blockCount}`);

    const bodyCodedLen = ctl.blockCount * 255;
    const full = F5.extractRaw(blocks2, (255 + bodyCodedLen) * 8, { seed: 'conformance-container', k });
    console.log('full len:', full ? full.length : 'null');
    const bodyCoded = full.slice(255);
    const [body, recErr] = ErrorCorrection.recover(bodyCoded, ctl.profileName, ctl.originalLength, ctl.blockCount);
    console.log('recover:', recErr ? recErr.message : 'OK');
    break;
}
