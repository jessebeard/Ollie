import { describe, it, expect } from '../utils/test-runner.js';
// RED: module does not exist yet - this suite must fail until Cycle 1 GREEN.
import { parseCsv } from '../../src/utils/csv.js';

describe('parseCsv (RFC 4180)', () => {
    it('parses simple comma-separated rows', () => {
        const [rows, err] = parseCsv('a,b,c\n1,2,3');
        expect(err).toEqual(null);
        expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    });

    it('accepts both CRLF and LF line endings', () => {
        const [crlf, e1] = parseCsv('a,b\r\n1,2\r\n');
        const [lf, e2] = parseCsv('a,b\n1,2\n');
        expect(e1).toEqual(null);
        expect(e2).toEqual(null);
        expect(crlf).toEqual(lf);
    });

    it('strips a UTF-8 BOM from the first header cell', () => {
        const [rows, err] = parseCsv('\uFEFFname,age\nx,1');
        expect(err).toEqual(null);
        expect(rows[0]).toEqual(['name', 'age']);
    });

    it('keeps quoted fields containing commas and quotes (doubled-quote escape)', () => {
        const [rows, err] = parseCsv('"say ""hi"", ok",plain\n"x","y"');
        expect(err).toEqual(null);
        expect(rows[0]).toEqual(['say "hi", ok', 'plain']);
        expect(rows[1]).toEqual(['x', 'y']);
    });

    it('preserves embedded newlines inside quoted fields', () => {
        const [rows, err] = parseCsv('a,b\n"line1\nline2",z');
        expect(err).toEqual(null);
        expect(rows.length).toBe(2);
        expect(rows[1][0]).toBe('line1\nline2');
    });

    it('treats empty lines as skipped rows, not empty records', () => {
        const [rows, err] = parseCsv('a,b\n\n1,2\n');
        expect(err).toEqual(null);
        expect(rows.length).toBe(2);
    });

    it('returns an empty row set for blank input via tuple error', () => {
        const [, err] = parseCsv('');
        if (!(err instanceof Error)) throw new Error('blank input must fail via tuple');
        const [rows2, err2] = parseCsv('   \n  ');
        if (!(err2 instanceof Error)) throw new Error('whitespace-only input must fail via tuple');
        expect(rows2).toEqual(null);
    });

    it('flags unterminated quoted fields as a tuple error', () => {
        const [, err] = parseCsv('a,"unterminated');
        if (!(err instanceof Error)) throw new Error('unterminated quote must fail');
        expect(err.message.toLowerCase()).toContain('quote');
    });

    it('reports ragged rows instead of throwing (caller decides policy)', () => {
        const [rows, err] = parseCsv('a,b,c\n1,2');
        expect(err).toEqual(null);
        expect(rows.length).toBe(2);
        expect(rows[1].length).toBe(2);
    });

    describe('KeePass backslash escape mode', () => {
        it('decodes backslash-quote and double-backslash inside quoted fields', () => {
            // Value bytes: back\slash"site -> KeePass encoding: "back\\slash\"site"
            const csvLine = '"Account","Login Name"\n"back\\\\slash\\"site","plain"';
            const [rows, err] = parseCsv(csvLine, { escapeStyle: 'keepass' });
            expect(err).toEqual(null);
            expect(rows[0]).toEqual(['Account', 'Login Name']);
            expect(rows[1][0]).toBe('back\\slash"site');
        });

        it('does not treat doubled quotes as escapes in keepass mode', () => {
            // RFC: "ab""" -> ab"   |   KeePass: bare quotes terminate the
            // field; trailing quotes are literal -> ab""
            const [rfcRows] = parseCsv('"ab"""');
            const [kpRows] = parseCsv('"ab"""', { escapeStyle: 'keepass' });
            expect(rfcRows[0][0]).toBe('ab"');
            expect(kpRows[0][0]).toBe('ab""');
        });
    });
});
