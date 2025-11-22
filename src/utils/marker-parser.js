/**
 * MarkerParser - Parses JPEG file structure and extracts segments
 * 
 * JPEG files consist of markers (0xFFxx) followed by optional segment data.
 * This module provides functions to locate markers and extract their payloads.
 */

// Marker constants (from JPEG spec)
export const MARKERS = {
    SOI: 0xFFD8,   // Start of Image
    EOI: 0xFFD9,   // End of Image
    SOF0: 0xFFC0,  // Baseline DCT
    SOF1: 0xFFC1,  // Extended Sequential DCT
    SOF2: 0xFFC2,  // Progressive DCT
    DHT: 0xFFC4,   // Define Huffman Table
    DQT: 0xFFDB,   // Define Quantization Table
    DRI: 0xFFDD,   // Define Restart Interval
    SOS: 0xFFDA,   // Start of Scan
    RST0: 0xFFD0,  // Restart markers
    RST7: 0xFFD7,
    APP0: 0xFFE0,  // Application segments
    APP15: 0xFFEF,
    COM: 0xFFFE    // Comment
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
export function readMarkerSegment(data, offset) {
    if (offset + 1 >= data.length) {
        throw new Error('Invalid marker offset');
    }

    const marker = (data[offset] << 8) | data[offset + 1];

    // Markers without length field (standalone markers)
    const standaloneMarkers = [
        MARKERS.SOI, MARKERS.EOI,
        MARKERS.RST0, MARKERS.RST0 + 1, MARKERS.RST0 + 2, MARKERS.RST0 + 3,
        MARKERS.RST0 + 4, MARKERS.RST0 + 5, MARKERS.RST0 + 6, MARKERS.RST7
    ];

    if (standaloneMarkers.includes(marker)) {
        return {
            type: marker,
            data: new Uint8Array(0),
            nextOffset: offset + 2
        };
    }

    // Read length (big-endian, 16-bit, includes length bytes themselves)
    if (offset + 3 >= data.length) {
        throw new Error('Incomplete segment length');
    }

    const length = (data[offset + 2] << 8) | data[offset + 3];

    if (length < 2) {
        throw new Error(`Invalid segment length: ${length}`);
    }

    // Extract segment data (excluding marker and length)
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

    // Validate SOI marker
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

        // Store segment by type
        const markerName = getMarkerName(segment.type);
        if (!segments.has(markerName)) {
            segments.set(markerName, []);
        }
        segments.get(markerName).push({
            offset: markerInfo.offset,
            data: segment.data
        });

        // Check for EOI
        if (segment.type === MARKERS.EOI) {
            foundEOI = true;
        }

        // Special handling for SOS - scan data follows until next marker
        if (segment.type === MARKERS.SOS) {
            // Find the end of scan data (next marker that's not a restart marker)
            let scanDataStart = segment.nextOffset;
            let scanDataEnd = scanDataStart;

            for (let i = scanDataStart; i < jpegBytes.length - 1; i++) {
                if (jpegBytes[i] === 0xFF) {
                    const nextByte = jpegBytes[i + 1];
                    // Skip byte stuffing (0xFF 0x00)
                    if (nextByte === 0x00) {
                        i++; // Skip the 0x00
                        continue;
                    }
                    // Skip restart markers
                    if (nextByte >= 0xD0 && nextByte <= 0xD7) {
                        i++; // Skip the restart marker
                        continue;
                    }
                    // Found a real marker - end of scan data
                    if (nextByte !== 0xFF) {
                        scanDataEnd = i;
                        break;
                    }
                }
            }

            // Store scan data
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

    // Handle APP markers (0xFFE0 - 0xFFEF)
    if (marker >= 0xFFE0 && marker <= 0xFFEF) {
        return `APP${marker - 0xFFE0}`;
    }

    // Handle RST markers (0xFFD0 - 0xFFD7)
    if (marker >= 0xFFD0 && marker <= 0xFFD7) {
        return `RST${marker - 0xFFD0}`;
    }

    return `UNKNOWN_0x${marker.toString(16).toUpperCase()}`;
}
