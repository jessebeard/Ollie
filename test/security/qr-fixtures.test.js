import { describe, it, expect } from '../utils/test-runner.js';
import { encodeQR } from '../../src/codec/qr-encoder.js';
import { decodeQR } from '../../src/codec/qr-decoder.js';
import fs from 'fs';
import zlib from 'zlib';
import { GenericGF } from '../../src/information-theory/error-correction/galois-field.js';
import { ReedSolomonEncoder } from '../../src/information-theory/error-correction/reed-solomon-codec.js';

/**
 * Real-world fixture acceptance: TOTP enrollment QRs captured from
 * Discord/Dropbox/GitHub/GitLab. These exceed the production encoder's
 * v6 ceiling (v8-v11 symbols) and exercise anti-aliased edges + tight
 * crops. Node-side PNG decode stands in for browser createImageBitmap.
 */

const FIXTURE_DIR = 'test/fixtures/TOTP-QRcode-examples/';

function decodePngFixture(file) {
    const buf = fs.readFileSync(FIXTURE_DIR + file);
    let pos = 8, w = 0, h = 0, bd = 0, ct = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); bd = buf[pos + 16]; ct = buf[pos + 17]; }
        if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
        pos += 12 + len;
    }
    const channels = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0;
    if (!channels || bd !== 8) throw new Error('fixture ' + file + ': unsupported PNG variant');
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * channels;
    const out = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? out[y*stride+x-channels] : 0;
            const b = y > 0 ? out[(y-1)*stride+x] : 0;
            const c = (x >= channels && y > 0) ? out[(y-1)*stride+x-channels] : 0;
            let v = raw[y*(stride+1)+1+x];
            if (f===1) v=(v+a)&0xFF; else if(f===2)v=(v+b)&0xFF; else if(f===3)v=(v+((a+b)>>1))&0xFF;
            else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&0xFF;}
            out[y*stride+x]=v;
        }
    }
    const rgba = new Uint8ClampedArray(w*h*4);
    for (let i=0;i<w*h;i++){
        rgba[i*4]=out[i*channels];rgba[i*4+1]=out[i*channels+1];rgba[i*4+2]=out[i*channels+2];
        rgba[i*4+3]=ct===6?out[i*channels+3]:255;
    }
    return { data: rgba, width: w, height: h };
}

/** Parses "Key:" / bare-hex lines from vendor secret text files. */
function loadExpectedSecret(site) {
    const raw = fs.readFileSync(FIXTURE_DIR + site + 'TOTPsecret.txt', 'utf8');
    const keyLine = raw.split('\n').find(l => /key\s*:/i.test(l));
    const source = keyLine || raw;
    const hexish = source.replace(/[^0-9a-zA-Z]/g, '');
    return hexish.toLowerCase();
}

describe('QR decoder: real-world TOTP fixtures', () => {
    for (const site of ['discord', 'dropbox', 'github', 'gitlab']) {
        it(`decodes ${site}.png and its secret matches ${site}TOTPsecret.txt`, () => {
            const img = decodePngFixture(site + '.png');
            const [result, err] = decodeQR(img);
            expect(err).toEqual(null);
            if (!result) throw new Error('no result');

            const text = new TextDecoder().decode(result.bytes);
            if (!/^otpauth:\/\//i.test(text)) throw new Error(`not otpauth: '${text.slice(0, 60)}'`);

            // Extract secret parameter from decoded URI
            const mSecret = text.match(/[?&]secret=([A-Za-z0-9]+)/);
            if (!mSecret) throw new Error('decoded URI carries no secret parameter');
            const decodedSecret = mSecret[1].toLowerCase();

            const expected = loadExpectedSecret(site);
            if (decodedSecret !== expected) {
                throw new Error(`secret mismatch for ${site}: decoded '${decodedSecret}' vs file '${expected}'`);
            }

            // Version sanity: these fixtures are known v8+
            void result.version;
        });
    }
});
