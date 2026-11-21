import { describe, it, expect } from '../utils/test-runner.js';
import { parseFrameHeader } from '../../src/automata/parsers/sof-automaton.js';
import { JpegDecoder } from '../../src/codec/decoder.js';
import { decodeBlock } from '../../src/automata/entropy-coding/huffman-decoder-fsm.js';

function buildSofSegment(components, width = 64, height = 64) {
    const segment = new Uint8Array(6 + components.length * 3);
    segment[0] = 8;
    segment[1] = (height >> 8) & 0xFF;
    segment[2] = height & 0xFF;
    segment[3] = (width >> 8) & 0xFF;
    segment[4] = width & 0xFF;
    segment[5] = components.length;
    let offset = 6;
    for (const [id, hv, tq] of components) {
        segment[offset++] = id;
        segment[offset++] = hv;
        segment[offset++] = tq;
    }
    return segment;
}

describe('Decoder fail-loud hardening', () => {

    it('parseFrameHeader accepts a well-formed SOF0', () => {
        const [header, err] = parseFrameHeader(buildSofSegment([[1, 0x11, 0], [2, 0x11, 1], [3, 0x11, 1]]));
        expect(err).toEqual(null);
        expect(header.components.length).toBe(3);
    });

    it('parseFrameHeader rejects duplicate component IDs', () => {
        const [header, err] = parseFrameHeader(buildSofSegment([[1, 0x11, 0], [1, 0x11, 1], [2, 0x11, 1]]));
        expect(header).toEqual(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase().includes('duplicate')).toBe(true);
    });

    it('decodeBlock refuses to silently allocate a throwaway target block', () => {
        const [result, err] = decodeBlock(null, {}, {}, 0);

        expect(result).toEqual(null);
        expect(err instanceof Error).toBe(true);
        expect(err.message.toLowerCase().includes('requires a target')).toBe(true);
    });

    it('decodeScan reports out-of-range block access as a typed error', () => {
        const decoder = new JpegDecoder();
        decoder.hardreset();
        decoder.frameHeader = {
            width: 64,
            height: 64,
            mcuCols: 2,
            mcuRows: 2,
            sofType: 0xC0,
            components: [{ id: 1, hSampling: 1, vSampling: 1, quantTableId: 0 }]
        };
        decoder.components = {
            1: { blocks: new Array(0), blocksH: 1, blocksV: 1, hSampling: 1, vSampling: 1 }
        };
        decoder.huffmanTables.set('0_0', {});
        decoder.huffmanTables.set('1_0', {});

        const result = decoder.decodeScan(
            new Uint8Array([0xFF]),
            { Ss: 0, Se: 63, Ah: 0, Al: 0, components: [{ selector: 1, dcTableId: 0, acTableId: 0 }] }
        );

        expect(result instanceof Error).toBe(true);
        expect(result.message).toContain('out of range');
    });
});
