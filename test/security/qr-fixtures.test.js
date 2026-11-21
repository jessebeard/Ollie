import { describe, it, expect } from '../utils/test-runner.js';
import { decodeQR } from '../../src/codec/qr-decoder.js';

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

const FIXTURE_DIR = 'test/fixtures/TOTP-QRcode-examples/';

async function decodePngFixture(file) {
    if (isNode) {
        const fs = (await import('fs')).default;
        const zlib = (await import('zlib')).default;
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
                const a = x >= channels ? out[y * stride + x - channels] : 0;
                const b = y > 0 ? out[(y - 1) * stride + x] : 0;
                const c = (x >= channels && y > 0) ? out[(y - 1) * stride + x - channels] : 0;
                let v = raw[y * (stride + 1) + 1 + x];
                if (f === 1) v = (v + a) & 0xFF; else if (f === 2) v = (v + b) & 0xFF; else if (f === 3) v = (v + ((a + b) >> 1)) & 0xFF;
                else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xFF; }
                out[y * stride + x] = v;
            }
        }
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            rgba[i * 4] = out[i * channels];
            rgba[i * 4 + 1] = out[i * channels + 1];
            rgba[i * 4 + 2] = out[i * channels + 2];
            rgba[i * 4 + 3] = ct === 6 ? out[i * channels + 3] : 255;
        }
        return { data: rgba, width: w, height: h };
    } else {
        const candidates = [
            `../${FIXTURE_DIR}${file}`,
            `/${FIXTURE_DIR}${file}`,
            `${FIXTURE_DIR}${file}`
        ];
        let blob = null;
        for (const url of candidates) {
            try {
                const res = await fetch(url);
                if (res.ok) { blob = await res.blob(); break; }
            } catch {}
        }
        if (!blob) throw new Error(`Could not fetch fixture ${file}`);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return { data: imgData.data, width: bitmap.width, height: bitmap.height };
    }
}

/** Parses "Key:" / bare-hex lines from vendor secret text files. */
async function loadExpectedSecret(site) {
    let raw = '';
    if (isNode) {
        const fs = (await import('fs')).default;
        raw = fs.readFileSync(FIXTURE_DIR + site + 'TOTPsecret.txt', 'utf8');
    } else {
        const candidates = [
            `../${FIXTURE_DIR}${site}TOTPsecret.txt`,
            `/${FIXTURE_DIR}${site}TOTPsecret.txt`,
            `${FIXTURE_DIR}${site}TOTPsecret.txt`
        ];
        for (const url of candidates) {
            try {
                const res = await fetch(url);
                if (res.ok) { raw = await res.text(); break; }
            } catch {}
        }
    }
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const keyLine = lines.find(l => /key\s*:/i.test(l));
    let source = raw;
    if (keyLine) {
        const stripped = keyLine.replace(/^[^:]*:\s*/i, '').trim();
        if (stripped.length > 0) {
            source = stripped;
        } else {
            const idx = lines.indexOf(keyLine);
            if (idx >= 0 && idx + 1 < lines.length) source = lines[idx + 1];
        }
    }
    const hexish = source.replace(/[^0-9a-zA-Z]/g, '');
    return hexish.toLowerCase();
}

describe('QR decoder: real-world TOTP fixtures', () => {
    for (const site of ['discord', 'dropbox', 'github', 'gitlab']) {
        it(`decodes ${site}.png and its secret matches ${site}TOTPsecret.txt`, async () => {
            const img = await decodePngFixture(site + '.png');
            const [result, err] = decodeQR(img);
            expect(err).toEqual(null);
            expect(result).not.toBe(null);

            const text = new TextDecoder().decode(result.bytes);
            expect(/^otpauth:\/\//i.test(text)).toBe(true);

            // Extract secret parameter from decoded URI
            const mSecret = text.match(/[?&]secret=([A-Za-z0-9]+)/);
            expect(mSecret).not.toBe(null);
            const decodedSecret = mSecret[1].toLowerCase();

            const expected = await loadExpectedSecret(site);
            expect(decodedSecret).toBe(expected);
        });
    }
});
