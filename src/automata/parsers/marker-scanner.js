/**
 * MarkerParser - Parses JPEG file structure and extracts segments
 * 
 * JPEG files consist of markers (0xFFxx) followed by optional segment data.
 * This module provides functions to locate markers and extract their payloads.
 */

export const MARKERS = {
    SOI: 0xFFD8,   
    EOI: 0xFFD9,   
    SOF0: 0xFFC0,  
    SOF1: 0xFFC1,  
    SOF2: 0xFFC2,  
    DHT: 0xFFC4,   
    DQT: 0xFFDB,   
    DRI: 0xFFDD,   
    SOS: 0xFFDA,   
    RST0: 0xFFD0,  
    RST7: 0xFFD7,
    APP0: 0xFFE0,  
    APP15: 0xFFEF,
    COM: 0xFFFE    
};

/**
 * Find the next marker in the data starting from offset
 * @param {Uint8Array} data - JPEG file data
 * @param {number} offset - Starting offset
 * @returns {{marker: number, offset: number} | null} Marker code and its offset, or null if not found
 */
export function findNextMarker(data, offset = 0) {
    for (let i = offset; i < data.length - 1; i++) {
        if (data[i] === 0xFF && data[i + 1] !== 0x00 && data[i + 1] !== 0xFF) {
            const marker = (data[i] << 8) | data[i + 1];
            return { marker, offset: i };
        }
    }
    return null;
}

/**
 * Read a marker segment (marker + length + data)
 * @param {Uint8Array} data - JPEG file data
 * @param {number} offset - Offset of the marker
 * @returns {{type: number, data: Uint8Array, nextOffset: number}} Segment info
 */
const STANDALONE_MARKERS = new Set([
    MARKERS.SOI, MARKERS.EOI,
    MARKERS.RST0, MARKERS.RST0 + 1, MARKERS.RST0 + 2, MARKERS.RST0 + 3,
    MARKERS.RST0 + 4, MARKERS.RST0 + 5, MARKERS.RST0 + 6, MARKERS.RST7
]);

export function readMarkerSegment(data, offset) {
    if (offset + 1 >= data.length) {
        throw new Error('Invalid marker offset');
    }

    const marker = (data[offset] << 8) | data[offset + 1];

    if (STANDALONE_MARKERS.has(marker)) {
        return {
            type: marker,
            data: new Uint8Array(0),
            nextOffset: offset + 2
        };
    }

    if (offset + 3 >= data.length) {
        throw new Error('Incomplete segment length');
    }

    const length = (data[offset + 2] << 8) | data[offset + 3];

    if (length < 2) {
        throw new Error(`Invalid segment length: ${length}`);
    }

    const dataLength = length - 2;
    const segmentData = data.slice(offset + 4, offset + 4 + dataLength);

    if (segmentData.length !== dataLength) {
        throw new Error('Incomplete segment data');
    }

    return {
        type: marker,
        data: segmentData,
        nextOffset: offset + 2 + length
    };
}

/**
 * Parse the entire JPEG file structure into a map of segments
 * @param {Uint8Array} jpegBytes - Complete JPEG file data
 * @returns {Map<string, Array>} Map of marker types to arrays of segment data
 */
export function parseFileStructure(jpegBytes) {
    const segments = new Map();

    if (jpegBytes.length < 2 || jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) {
        throw new Error('Invalid JPEG file: missing SOI marker');
    }

    let offset = 0;
    let foundEOI = false;

    while (offset < jpegBytes.length && !foundEOI) {
        const markerInfo = findNextMarker(jpegBytes, offset);

        if (!markerInfo) {
            break;
        }

        const segment = readMarkerSegment(jpegBytes, markerInfo.offset);

        const markerName = getMarkerName(segment.type);
        if (!segments.has(markerName)) {
            segments.set(markerName, []);
        }
        segments.get(markerName).push({
            offset: markerInfo.offset,
            data: segment.data
        });

        if (segment.type === MARKERS.EOI) {
            foundEOI = true;
        }

        if (segment.type === MARKERS.SOS) {
            
            let scanDataStart = segment.nextOffset;
            let scanDataEnd = scanDataStart;

            for (let i = scanDataStart; i < jpegBytes.length - 1; i++) {
                if (jpegBytes[i] === 0xFF) {
                    const nextByte = jpegBytes[i + 1];
                    
                    if (nextByte === 0x00) {
                        i++; 
                        continue;
                    }
                    
                    if (nextByte >= 0xD0 && nextByte <= 0xD7) {
                        i++; 
                        continue;
                    }
                    
                    if (nextByte !== 0xFF) {
                        scanDataEnd = i;
                        break;
                    }
                }
            }

            const scanData = jpegBytes.slice(scanDataStart, scanDataEnd);
            segments.get(markerName)[segments.get(markerName).length - 1].scanData = scanData;

            offset = scanDataEnd;
        } else {
            offset = segment.nextOffset;
        }
    }

    return segments;
}

/**
 * Get human-readable marker name
 * @param {number} marker - Marker code
 * @returns {string} Marker name
 */
export function getMarkerName(marker) {
    for (const [name, code] of Object.entries(MARKERS)) {
        if (code === marker) {
            return name;
        }
    }

    if (marker >= 0xFFE0 && marker <= 0xFFEF) {
        return `APP${marker - 0xFFE0}`;
    }

    if (marker >= 0xFFD0 && marker <= 0xFFD7) {
        return `RST${marker - 0xFFD0}`;
    }

    return `UNKNOWN_0x${marker.toString(16).toUpperCase()}`;
}
