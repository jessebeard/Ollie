/**
 * Parser-fuzz worker: receives mutated JPEG bytes, runs the full decode
 * pipeline and the structural parser, reports an outcome summary.
 *
 * Isolation contract: this worker may hang or OOM on hostile input - the
 * parent enforces a hard timeout + terminate, which is itself a test
 * finding (parser hangs/allocation bombs are defects).
 */
import { parentPort } from 'worker_threads';
import { JpegDecoder } from '../../src/codec/decoder.js';
import { parseFileStructure } from '../../src/automata/parsers/marker-scanner.js';

parentPort.on('message', async ({ bytes }) => {
    const outcome = { parsed: false, decoded: false, errorStage: null };
    try {
        parseFileStructure(bytes);
        outcome.parsed = true;
    } catch {
        outcome.errorStage = 'parse';
    }

    try {
        const decoder = new JpegDecoder();
        const [result, err] = await decoder.decode(bytes, { skipExtraction: true });
        if (err) outcome.errorStage = outcome.errorStage ? `${outcome.errorStage}+decode` : 'decode';
        else if (result) outcome.decoded = true;
    } catch {
        outcome.errorStage = outcome.errorStage ? `${outcome.errorStage}+decode-throw` : 'decode-throw';
    }

    parentPort.postMessage({ kind: 'done', outcome });
});
