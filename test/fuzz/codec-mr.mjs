import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';

function seededRandom(seed) {
    let s = seed >>> 0;
    return (n) => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            out[i] = (s >>> 24) & 0xFF;
        }
        return out;
    };
}

function makeImage(size, seed, kind = 'noise') {
    const data = new Uint8ClampedArray(size * size * 4);
    const rng = seededRandom(seed);
    for (let px = 0; px < size * size; px++) {
        if (kind === 'noise') {
            data[px * 4] = rng(1)[0];
            data[px * 4 + 1] = rng(1)[0];
            data[px * 4 + 2] = rng(1)[0];
        } else {
            // smooth gradient - exercises quantization zero-runs
            data[px * 4] = (px % size) * 2 & 0xFF;
            data[px * 4 + 1] = (Math.floor(px / size)) * 2 & 0xFF;
            data[px * 4 + 2] = ((px % size) + Math.floor(px / size)) & 0xFF;
        }
        data[px * 4 + 3] = 255;
    }
    return { width: size, height: size, data };
}

/** Long-run entry point (scripts/fuzz.mjs registry). */
export async function runCodecMrfuzz(scale = 1) {
    // MR-dimension + MR-stability across the supported encoding grid.
    for (const size of [16, 64]) {
        for (const quality of [10, 50, 95]) {
            for (const subsampling of ['4:4:4', '4:2:0']) {
                const img = makeImage(size, size * 31 + quality, quality > 80 ? 'noise' : 'gradient');
                const encoderOpts = { subsampling };
                if (quality % 2 === 0) encoderOpts.restartInterval = 4;

                const enc1 = await new JpegEncoder(quality, encoderOpts).encode(img);
                const [dec1, decErr1] = await new JpegDecoder().decode(enc1, { skipExtraction: true });
                if (decErr1) throw new Error(`q${quality}/${subsampling} decode failed: ${decErr1.message}`);
                if (!dec1 || !dec1.data) throw new Error('decode returned no pixel data');
                if (dec1.width !== size || dec1.height !== size) {
                    throw new Error(`dimension drift: ${dec1.width}x${dec1.height} != ${size}`);
                }

                const enc2 = await new JpegEncoder(quality, encoderOpts).encode(img);
                if (enc1.length !== enc2.length || enc1.join() !== enc2.join()) {
                    throw new Error('encode is not deterministic');
                }
            }
        }
    }

    // MR-monotonicity: higher quality never yields a smaller encode.
    {
        const img = makeImage(48, 999, 'noise');
        let prev = null;
        for (const q of [15, 35, 60, 85]) {
            const bytes = await new JpegEncoder(q).encode(img);
            if (prev !== null && bytes.length < prev) {
                throw new Error(`quality monotonicity broken at q=${q}: ${bytes.length} < ${prev}`);
            }
            prev = bytes.length;
        }
    }

    // Pixel fidelity bound: mean absolute error stays modest at high quality.
    {
        const size = 32;
        const img = makeImage(size, 555, 'noise');
        const jpegBytes = await new JpegEncoder(92, { subsampling: '4:4:4' }).encode(img);
        const [decoded, decErr] = await new JpegDecoder().decode(jpegBytes, { skipExtraction: true });
        if (decErr) throw new Error(`decode failed: ${decErr.message}`);
        let mae = 0;
        for (let i = 0; i < size * size * 4; i += 4) {
            mae += Math.abs(decoded.data[i] - img.data[i]);
            mae += Math.abs(decoded.data[i + 1] - img.data[i + 1]);
            mae += Math.abs(decoded.data[i + 2] - img.data[i + 2]);
        }
        mae /= size * size * 3;
        if (mae > 24) throw new Error(`q92 MAE too high: ${mae.toFixed(1)}`);
    }

    // Stego survival: secret survives encode -> decode -> extract roundtrip.
    await assertProperty(
        [Arbitrary.byteArray(8, 40)],
        async (secret) => {
            const size = 128;
            const img = makeImage(size, 4242, 'noise');
            const encoder = new JpegEncoder(90, { subsampling: '4:4:4', metadata: {}, secretData: secret });
            const jpegBytes = await encoder.encode(img);

            const decoder = new JpegDecoder();
            const [decoded, decErr] = await decoder.decode(jpegBytes, {});
            if (decErr) throw new Error(`decode failed: ${decErr.message}`);
            if (!decoded || !decoded.secretData) throw new Error('secret lost');
            if (decoded.secretData.join() !== secret.join()) {
                throw new Error('secret corrupted through codec path');
            }
        },
        Math.max(3, 6 * scale)
    );
}
