
// Bundle of all JPEG encoder modules for local execution without modules

// 1. BitWriter
class BitWriter {
    constructor() {
        this.bytes = [];
        this.byte = 0;
        this.bitCount = 0;
    }

    writeBits(data, length) {
        for (let i = length - 1; i >= 0; i--) {
            const bit = (data >> i) & 1;
            this.writeBit(bit);
        }
    }

    writeBit(bit) {
        this.byte = (this.byte << 1) | bit;
        this.bitCount++;
        if (this.bitCount === 8) {
            this.bytes.push(this.byte);
            if (this.byte === 0xFF) {
                this.bytes.push(0x00);
            }
            this.byte = 0;
            this.bitCount = 0;
        }
    }

    flush() {
        if (this.bitCount > 0) {
            this.byte = this.byte << (8 - this.bitCount);
            this.bytes.push(this.byte);
            if (this.byte === 0xFF) {
                this.bytes.push(0x00);
            }
            this.bitCount = 0;
            this.byte = 0;
        }
        return new Uint8Array(this.bytes);
    }
}

// 2. Colorspace
function rgbToYcbcr(r, g, b) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

    return {
        y: Math.round(y),
        cb: Math.round(cb),
        cr: Math.round(cr)
    };
}

// 3. Blocks
function padDimensions(width, height) {
    return {
        width: Math.ceil(width / 8) * 8,
        height: Math.ceil(height / 8) * 8
    };
}

function extractBlock(data, imgWidth, imgHeight, x, y) {
    const block = new Float32Array(64);
    for (let row = 0; row < 8; row++) {
        const srcY = Math.min(y + row, imgHeight - 1);
        for (let col = 0; col < 8; col++) {
            const srcX = Math.min(x + col, imgWidth - 1);
            const srcIdx = srcY * imgWidth + srcX;
            block[row * 8 + col] = data[srcIdx];
        }
    }
    return block;
}

// 4. DCT
const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}
const C = new Float32Array(8);
C[0] = 1 / Math.sqrt(2);
for (let i = 1; i < 8; i++) C[i] = 1;

function forwardDCT(block) {
    const result = new Float32Array(64);
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            for (let x = 0; x < 8; x++) {
                for (let y = 0; y < 8; y++) {
                    const pixel = block[y * 8 + x];
                    const cosX = COS_TABLE[u * 8 + x];
                    const cosY = COS_TABLE[v * 8 + y];
                    sum += pixel * cosX * cosY;
                }
            }
            const cu = C[u];
            const cv = C[v];
            result[v * 8 + u] = 0.25 * cu * cv * sum;
        }
    }
    return result;
}

// 5. Quantization
const QUANTIZATION_TABLE_LUMA = new Int32Array([
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99
]);

const QUANTIZATION_TABLE_CHROMA = new Int32Array([
    17, 18, 24, 47, 99, 99, 99, 99,
    18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99,
    47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99
]);

function quantize(block, table) {
    const result = new Int32Array(64);
    for (let i = 0; i < 64; i++) {
        result[i] = Math.round(block[i] / table[i]);
    }
    return result;
}

// 6. ZigZag
const ZIGZAG_ORDER = new Int32Array([
    0, 1, 5, 6, 14, 15, 27, 28,
    2, 4, 7, 13, 16, 26, 29, 42,
    3, 8, 12, 17, 25, 30, 41, 43,
    9, 11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
    35, 36, 48, 49, 57, 58, 62, 63
]);

function zigZag(block) {
    const result = new Int32Array(64);
    for (let i = 0; i < 64; i++) {
        result[i] = block[ZIGZAG_ORDER[i]];
    }
    return result;
}

// 7. Huffman
const STD_DC_LUMINANCE_NRCODES = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const STD_DC_LUMINANCE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const STD_AC_LUMINANCE_NRCODES = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const STD_AC_LUMINANCE_VALUES = [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
    0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
    0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
    0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
    0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
    0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
    0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
    0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
    0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
    0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
    0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
    0xf9, 0xfa
];

function generateHuffmanTable(nrCodes, values) {
    const table = {};
    let code = 0;
    let valIdx = 0;

    for (let len = 1; len <= 16; len++) {
        const count = nrCodes[len];
        for (let i = 0; i < count; i++) {
            const val = values[valIdx++];
            table[val] = { code, length: len };
            code++;
        }
        code <<= 1;
    }
    return table;
}

const DC_LUMA_TABLE = generateHuffmanTable(STD_DC_LUMINANCE_NRCODES, STD_DC_LUMINANCE_VALUES);
const AC_LUMA_TABLE = generateHuffmanTable(STD_AC_LUMINANCE_NRCODES, STD_AC_LUMINANCE_VALUES);

function computeCategory(val) {
    if (val === 0) return 0;
    val = Math.abs(val);
    let cat = 0;
    while (val > 0) {
        val >>= 1;
        cat++;
    }
    return cat;
}

function getBitRepresentation(val) {
    if (val > 0) return val;
    const cat = computeCategory(val);
    return val + (1 << cat) - 1;
}

function encodeBlock(block, previousDC, writer, dcTable = DC_LUMA_TABLE, acTable = AC_LUMA_TABLE) {
    const dcVal = block[0];
    const diff = dcVal - previousDC;
    const dcCat = computeCategory(diff);
    const dcCode = dcTable[dcCat];

    writer.writeBits(dcCode.code, dcCode.length);
    if (dcCat > 0) {
        writer.writeBits(getBitRepresentation(diff), dcCat);
    }

    let zeroRun = 0;
    for (let i = 1; i < 64; i++) {
        const val = block[i];
        if (val === 0) {
            zeroRun++;
        } else {
            while (zeroRun >= 16) {
                const zrl = acTable[0xF0];
                writer.writeBits(zrl.code, zrl.length);
                zeroRun -= 16;
            }

            const cat = computeCategory(val);
            const symbol = (zeroRun << 4) | cat;
            const acCode = acTable[symbol];

            writer.writeBits(acCode.code, acCode.length);
            writer.writeBits(getBitRepresentation(val), cat);

            zeroRun = 0;
        }
    }

    if (zeroRun > 0) {
        const eob = acTable[0x00];
        writer.writeBits(eob.code, eob.length);
    }

    return dcVal;
}

// 8. JpegEncoder
class JpegEncoder {
    constructor(quality = 50) {
        this.quality = quality;
    }

    encode(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        const writer = new BitWriter();

        this.writeHeaders(writer, width, height);

        const padded = padDimensions(width, height);
        let prevDC_Y = 0;
        let prevDC_Cb = 0;
        let prevDC_Cr = 0;

        for (let y = 0; y < padded.height; y += 8) {
            for (let x = 0; x < padded.width; x += 8) {
                const Y = new Float32Array(64);
                const Cb = new Float32Array(64);
                const Cr = new Float32Array(64);

                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        const srcX = Math.min(x + col, width - 1);
                        const srcY = Math.min(y + row, height - 1);
                        const idx = (srcY * width + srcX) * 4;

                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];

                        const ycbcr = rgbToYcbcr(r, g, b);
                        Y[row * 8 + col] = ycbcr.y - 128;
                        Cb[row * 8 + col] = ycbcr.cb - 128;
                        Cr[row * 8 + col] = ycbcr.cr - 128;
                    }
                }

                prevDC_Y = this.processBlock(Y, prevDC_Y, QUANTIZATION_TABLE_LUMA, writer, DC_LUMA_TABLE, AC_LUMA_TABLE);
                prevDC_Cb = this.processBlock(Cb, prevDC_Cb, QUANTIZATION_TABLE_CHROMA, writer, DC_LUMA_TABLE, AC_LUMA_TABLE);
                prevDC_Cr = this.processBlock(Cr, prevDC_Cr, QUANTIZATION_TABLE_CHROMA, writer, DC_LUMA_TABLE, AC_LUMA_TABLE);
            }
        }

        const body = writer.flush();
        return this.assembleFile(body);
    }

    processBlock(blockData, prevDC, qTable, writer, dcTable, acTable) {
        const dct = forwardDCT(blockData);
        const quantized = quantize(dct, qTable);
        const zigzagged = zigZag(quantized);
        return encodeBlock(zigzagged, prevDC, writer, dcTable, acTable);
    }

    writeHeaders(writer, width, height) {
        this.headers = [];

        const writeByte = (b) => this.headers.push(b);
        const writeWord = (w) => {
            writeByte((w >> 8) & 0xFF);
            writeByte(w & 0xFF);
        };
        const writeArray = (arr) => {
            for (let i = 0; i < arr.length; i++) writeByte(arr[i]);
        };

        writeWord(0xFFD8); // SOI

        writeWord(0xFFE0); // APP0
        writeWord(16);
        writeArray([0x4A, 0x46, 0x49, 0x46, 0x00]);
        writeWord(0x0101);
        writeByte(0);
        writeWord(1);
        writeWord(1);
        writeByte(0);
        writeByte(0);

        writeWord(0xFFDB); // DQT Luma
        writeWord(2 + 1 + 64);
        writeByte(0);
        const lumaZig = zigZag(QUANTIZATION_TABLE_LUMA);
        for (let i = 0; i < 64; i++) writeByte(lumaZig[i]);

        writeWord(0xFFDB); // DQT Chroma
        writeWord(2 + 1 + 64);
        writeByte(1);
        const chromaZig = zigZag(QUANTIZATION_TABLE_CHROMA);
        for (let i = 0; i < 64; i++) writeByte(chromaZig[i]);

        writeWord(0xFFC0); // SOF0
        writeWord(8 + 3 * 3);
        writeByte(8);
        writeWord(height);
        writeWord(width);
        writeByte(3);

        writeByte(1); writeByte(0x11); writeByte(0); // Y
        writeByte(2); writeByte(0x11); writeByte(1); // Cb
        writeByte(3); writeByte(0x11); writeByte(1); // Cr

        this.writeDHT(writeByte, writeWord, writeArray, 0, 0, DC_LUMA_TABLE);
        this.writeDHT(writeByte, writeWord, writeArray, 0, 1, AC_LUMA_TABLE);

        writeWord(0xFFDA); // SOS
        writeWord(6 + 2 * 3);
        writeByte(3);
        writeByte(1); writeByte(0x00);
        writeByte(2); writeByte(0x00);
        writeByte(3); writeByte(0x00);
        writeByte(0); writeByte(63); writeByte(0);
    }

    writeDHT(writeByte, writeWord, writeArray, id, type, tableObj) {
        writeWord(0xFFC4);

        const dcCounts = type === 0 ?
            [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0] :
            [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];

        const dcValues = type === 0 ?
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] :
            [
                0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
                0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
                0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
                0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
                0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
                0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
                0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
                0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
                0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
                0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
                0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
                0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
                0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
                0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
                0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
                0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
                0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
                0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
                0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
                0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
                0xf9, 0xfa
            ];

        let totalLen = 2 + 1 + 16 + dcValues.length;
        writeWord(totalLen);
        writeByte((type << 4) | id);
        writeArray(dcCounts.slice(1));
        writeArray(dcValues);
    }

    assembleFile(scanData) {
        const headers = new Uint8Array(this.headers);
        const totalLength = headers.length + scanData.length + 2;
        const file = new Uint8Array(totalLength);

        file.set(headers, 0);
        file.set(scanData, headers.length);

        file[totalLength - 2] = 0xFF;
        file[totalLength - 1] = 0xD9;

        return file;
    }
}

// 9. Main
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const originalCanvas = document.getElementById('original-canvas');
    const processedCanvas = document.getElementById('processed-canvas');
    const encodeBtn = document.getElementById('encode-btn');
    const statusDiv = document.getElementById('status');

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                originalCanvas.width = img.width;
                originalCanvas.height = img.height;
                const ctx = originalCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                statusDiv.textContent = 'Image loaded. Ready to encode.';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    encodeBtn.addEventListener('click', async () => {
        statusDiv.textContent = 'Encoding...';

        await new Promise(r => setTimeout(r, 10));

        try {
            const ctx = originalCanvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);

            const encoder = new JpegEncoder();
            const jpegBytes = encoder.encode(imageData);

            const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            const resImg = new Image();
            resImg.onload = () => {
                processedCanvas.width = resImg.width;
                processedCanvas.height = resImg.height;
                const pCtx = processedCanvas.getContext('2d');
                pCtx.drawImage(resImg, 0, 0);
                statusDiv.textContent = `Encoded! Size: ${jpegBytes.length} bytes`;
            };
            resImg.src = url;

        } catch (e) {
            console.error(e);
            statusDiv.textContent = 'Error: ' + e.message;
        }
    });
});
