/**
 * Concurrency Result/Option Tuple Serializer.
 *
 * Implements lossless serialization and deserialization of Ollie Result tuples
 * [value, error] across worker message boundaries, respecting Code Quality Rule 6.
 */

const KNOWN_ERROR_CONSTRUCTORS = {
    RangeError,
    TypeError,
    ReferenceError,
    SyntaxError,
    URIError,
    EvalError,
    Error
};

/**
 * Serializes an Error instance into a plain structured record.
 *
 * @param {Error|any} err
 * @returns {Object|null}
 */
export function serializeError(err) {
    if (!err) return null;

    if (!(err instanceof Error) && typeof err === 'object') {
        return {
            name: err.name || 'Error',
            message: err.message || String(err),
            stack: err.stack || null,
            code: err.code || null,
            ...err
        };
    }

    if (typeof err !== 'object') {
        return {
            name: 'Error',
            message: String(err),
            stack: null,
            code: null
        };
    }

    const record = {
        name: err.name || 'Error',
        message: err.message || '',
        stack: err.stack || null,
        code: err.code || null
    };

    // Copy any caller-defined custom properties
    for (const key of Object.keys(err)) {
        if (!(key in record)) {
            try {
                record[key] = err[key];
            } catch {
                // Ignore non-serializable property getters
            }
        }
    }

    return record;
}

/**
 * Reconstructs an Error instance from a serialized record.
 *
 * @param {Object|null} record
 * @returns {Error|null}
 */
export function deserializeError(record) {
    if (!record) return null;

    if (record instanceof Error) return record;

    const Constructor = KNOWN_ERROR_CONSTRUCTORS[record.name] || Error;
    const err = new Constructor(record.message || '');
    err.name = record.name || 'Error';

    if (record.stack) {
        err.stack = record.stack;
    }
    if (record.code !== undefined && record.code !== null) {
        err.code = record.code;
    }

    // Restore any extra fields
    for (const key of Object.keys(record)) {
        if (!(key in err) && key !== 'name' && key !== 'message' && key !== 'stack' && key !== 'code') {
            err[key] = record[key];
        }
    }

    return err;
}

/**
 * Serializes an Ollie Result tuple [value, error] for worker transmission.
 *
 * @param {[any, Error|null]} tuple
 * @returns {{ ok: boolean, value: any, error: Object|null }}
 */
export function serializeTuple(tuple) {
    if (!Array.isArray(tuple)) {
        return {
            ok: false,
            value: null,
            error: serializeError(new Error('Invalid tuple shape: expected [value, error] array'))
        };
    }

    const [value, err] = tuple;
    if (err) {
        return {
            ok: false,
            value: value !== undefined ? value : null,
            error: serializeError(err)
        };
    }

    return {
        ok: true,
        value: value !== undefined ? value : null,
        error: null
    };
}

/**
 * Deserializes worker wire response into an Ollie Result tuple [value, error].
 *
 * @param {{ ok: boolean, value: any, error: Object|null }|any} wire
 * @returns {[any, Error|null]}
 */
export function deserializeTuple(wire) {
    if (!wire || typeof wire !== 'object') {
        return [null, new Error('Invalid wire payload: expected structured response object')];
    }

    if (!wire.ok) {
        return [wire.value !== undefined ? wire.value : null, deserializeError(wire.error) || new Error('Unknown worker task failure')];
    }

    return [wire.value !== undefined ? wire.value : null, null];
}
