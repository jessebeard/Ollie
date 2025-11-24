/**
 * SPIFF Parser
 * 
 * Parses SPIFF (Still Picture Interchange File Format) headers from APP8 markers.
 * Based on ISO/IEC 10918-3.
 */

export function parseSpiffHeader(data) {
    // SPIFF header structure:
    // 0-4: "SPIFF" (null terminated)
    // 5-6: Version (high, low)
    // 7: Profile ID
    // 8: Component count
    // 9-12: Height
    // 13-16: Width
    // 17: Color space
    // 18: Bits per sample
    // 19: Compression type
    // 20: Resolution units
    // 21-24: Vertical resolution
    // 25-28: Horizontal resolution

    if (data.length < 30) {
        throw new Error('SPIFF header too short');
    }

    // Check identifier "SPIFF\0"
    if (data[0] !== 0x53 || data[1] !== 0x50 || data[2] !== 0x49 ||
        data[3] !== 0x46 || data[4] !== 0x46 || data[5] !== 0x00) {
        throw new Error('Invalid SPIFF identifier');
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
        version: {
            major: data[6],
            minor: data[7]
        },
        profileId: data[8],
        componentCount: data[9],
        height: view.getUint32(10, false), // Big-endian
        width: view.getUint32(14, false),
        colorSpace: data[18],
        bitsPerSample: data[19],
        compressionType: data[20],
        resolutionUnits: data[21],
        verticalResolution: view.getUint32(22, false),
        horizontalResolution: view.getUint32(26, false)
    };
}

export const SPIFF_COLOR_SPACES = {
    0: 'Bi-level',
    1: 'YCbCr 1 (ITU-R BT.709)',
    2: 'No color space specified',
    3: 'YCbCr 2 (ITU-R BT.601-1)',
    4: 'YCbCr 3 (ITU-R BT.601-1)',
    8: 'Grayscale',
    10: 'RGB',
    12: 'CMY',
    13: 'CMYK',
    14: 'YCCK',
    15: 'CIELab'
};

export const SPIFF_COMPRESSION_TYPES = {
    0: 'Uncompressed',
    1: 'Modified Huffman',
    2: 'Modified READ',
    3: 'Modified Modified READ',
    4: 'JBIG',
    5: 'JPEG',
    6: 'JPEG-LS'
};

export const SPIFF_RESOLUTION_UNITS = {
    0: 'Aspect Ratio',
    1: 'Dots per inch',
    2: 'Dots per centimeter'
};
