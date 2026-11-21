import { describe, it, expect } from '../test-runner.js';
import {
    serializeError,
    deserializeError,
    serializeTuple,
    deserializeTuple
} from '../../../src/utils/concurrency/tuple-serializer.js';

describe('Concurrency Tuple Serializer', () => {
    it('serializes and deserializes standard Error', () => {
        const original = new Error('Test failure');
        original.code = 'ERR_TEST_CODE';

        const serialized = serializeError(original);
        expect(serialized.name).toBe('Error');
        expect(serialized.message).toBe('Test failure');
        expect(serialized.code).toBe('ERR_TEST_CODE');

        const restored = deserializeError(serialized);
        expect(restored instanceof Error).toBe(true);
        expect(restored.name).toBe('Error');
        expect(restored.message).toBe('Test failure');
        expect(restored.code).toBe('ERR_TEST_CODE');
    });

    it('preserves specific Error types (RangeError, TypeError)', () => {
        const rangeErr = new RangeError('Index out of bounds');
        const typeErr = new TypeError('Invalid buffer type');

        const restoredRange = deserializeError(serializeError(rangeErr));
        const restoredType = deserializeError(serializeError(typeErr));

        expect(restoredRange instanceof RangeError).toBe(true);
        expect(restoredRange.message).toBe('Index out of bounds');

        expect(restoredType instanceof TypeError).toBe(true);
        expect(restoredType.message).toBe('Invalid buffer type');
    });

    it('serializes and deserializes successful Result tuple [value, null]', () => {
        const tuple = [{ id: 42, label: 'sample' }, null];
        const wire = serializeTuple(tuple);

        expect(wire.ok).toBe(true);
        expect(wire.error).toBeNull();
        expect(wire.value.id).toBe(42);

        const [res, err] = deserializeTuple(wire);
        expect(err).toBeNull();
        expect(res.id).toBe(42);
        expect(res.label).toBe('sample');
    });

    it('serializes and deserializes failure Result tuple [null, Error]', () => {
        const originalError = new Error('Steganography capacity exceeded');
        const tuple = [null, originalError];
        const wire = serializeTuple(tuple);

        expect(wire.ok).toBe(false);
        expect(wire.value).toBeNull();
        expect(wire.error.message).toBe('Steganography capacity exceeded');

        const [res, err] = deserializeTuple(wire);
        expect(res).toBeNull();
        expect(err instanceof Error).toBe(true);
        expect(err.message).toBe('Steganography capacity exceeded');
    });

    it('handles non-Error objects gracefully in serializeError', () => {
        const stringErr = serializeError('Plain string error');
        const restored = deserializeError(stringErr);
        expect(restored instanceof Error).toBe(true);
        expect(restored.message).toBe('Plain string error');

        const nullErr = serializeError(null);
        expect(nullErr).toBeNull();
        expect(deserializeError(null)).toBeNull();
    });
});
