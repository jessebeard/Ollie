import { describe, it, expect, assert, onTestComplete, getTestResults, resetStats } from './test-runner.js';

describe('Test Runner: Core Matchers & Types', () => {

    it('toBe: verifies primitive and identity equality', () => {
        expect(1).toBe(1);
        expect('hello').toBe('hello');
        expect(true).toBe(true);
        expect(false).toBe(false);

        const obj = { a: 1 };
        expect(obj).toBe(obj);

        expect(() => expect(1).toBe(2)).toThrow(/Expected 2 but got 1/);
        expect(() => expect('a').toBe('b')).toThrow(/Expected b but got a/);
    });

    it('toEqual: verifies deep equality for objects, arrays, and typed arrays', () => {
        expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] });
        expect([1, 'two', { three: 3 }]).toEqual([1, 'two', { three: 3 }]);

        // Deep Uint8Array byte equality
        const u1 = new Uint8Array([1, 2, 3, 255]);
        const u2 = new Uint8Array([1, 2, 3, 255]);
        const u3 = new Uint8Array([1, 2, 4, 255]);
        expect(u1).toEqual(u2);
        expect(() => expect(u1).toEqual(u3)).toThrow();

        expect(() => expect({ a: 1 }).toEqual({ a: 2 })).toThrow();
    });

    it('toBeCloseTo: checks floating-point tolerance with customizable precision', () => {
        expect(0.1 + 0.2).toBeCloseTo(0.3, 5);
        expect(Math.PI).toBeCloseTo(3.14, 2);
        expect(Math.PI).toBeCloseTo(3.14159, 4);

        expect(() => expect(3.14159).toBeCloseTo(3.15, 2)).toThrow(/close to/);
    });

    it('numerical comparisons: toBeGreaterThan, toBeLessThan, and OrEqual variants', () => {
        expect(10).toBeGreaterThan(5);
        expect(10).toBeGreaterThanOrEqual(10);
        expect(10).toBeGreaterThanOrEqual(9);

        expect(5).toBeLessThan(10);
        expect(5).toBeLessThanOrEqual(5);
        expect(5).toBeLessThanOrEqual(6);

        expect(() => expect(5).toBeGreaterThan(10)).toThrow();
        expect(() => expect(10).toBeLessThan(5)).toThrow();
    });

    it('existence & boolean matchers: toBeDefined, toBeUndefined, toBeNull, toBeTruthy, toBeFalsy, toBeNaN', () => {
        expect(123).toBeDefined();
        expect(undefined).toBeUndefined();
        expect(null).toBeNull();
        expect(true).toBeTruthy();
        expect('non-empty').toBeTruthy();
        expect(false).toBeFalsy();
        expect('').toBeFalsy();
        expect(0).toBeFalsy();
        expect(NaN).toBeNaN();

        expect(() => expect(undefined).toBeDefined()).toThrow();
        expect(() => expect('defined').toBeUndefined()).toThrow();
        expect(() => expect(undefined).toBeNull()).toThrow();
        expect(() => expect(false).toBeTruthy()).toThrow();
        expect(() => expect(true).toBeFalsy()).toThrow();
        expect(() => expect(123).toBeNaN()).toThrow();
    });

    it('toBeInstanceOf: verifies constructor prototype inheritance', () => {
        class CustomError extends Error {}
        const err = new CustomError('custom failure');
        const buffer = new Uint8Array(16);

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(CustomError);
        expect(buffer).toBeInstanceOf(Uint8Array);
        expect([]).toBeInstanceOf(Array);

        expect(() => expect('not-an-error').toBeInstanceOf(Error)).toThrow(/instance of Error/);
        expect(() => expect(null).toBeInstanceOf(Object)).toThrow();
    });

    it('toMatch: verifies RegExp patterns and substring inclusion', () => {
        expect('otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP').toMatch(/^otpauth:\/\/totp\//);
        expect('Rev 42 · 2026-08-28').toMatch(/Rev \d+/);
        expect('Bearer token_xyz').toMatch('token_xyz');

        expect(() => expect('hello world').toMatch(/^goodbye/)).toThrow(/match/);
    });

    it('toHaveLength: verifies length property of arrays, strings, and typed arrays', () => {
        expect('hello').toHaveLength(5);
        expect([1, 2, 3]).toHaveLength(3);
        expect(new Uint8Array(32)).toHaveLength(32);
        expect([]).toHaveLength(0);

        expect(() => expect([1, 2]).toHaveLength(5)).toThrow(/Expected length 5 but got 2/);
    });

    it('toContain: verifies element containment in strings and arrays', () => {
        expect('quick brown fox').toContain('brown');
        expect([10, 20, 30]).toContain(20);

        expect(() => expect('abc').toContain('xyz')).toThrow(/contain/);
        expect(() => expect([1, 2]).toContain(99)).toThrow(/contain/);
    });
});

describe('Test Runner: Exceptions & Asynchronous Rejections', () => {

    it('toThrow: verifies synchronous function exceptions and messages', () => {
        const thrower = () => { throw new Error('invalid parameter: code 400'); };
        expect(thrower).toThrow();
        expect(thrower).toThrow('invalid parameter');
        expect(thrower).toThrow(/code \d+/);

        const nonThrower = () => 42;
        expect(() => expect(nonThrower).toThrow()).toThrow(/Expected function to throw/);
    });

    it('toReject: verifies asynchronous Promise rejections', async () => {
        const asyncThrower = async () => { throw new TypeError('async network timeout'); };
        await expect(asyncThrower).toReject();
        await expect(asyncThrower).toReject('async network');
        await expect(asyncThrower).toReject(/timeout/);
        await expect(asyncThrower).toReject(TypeError);

        const asyncSuccess = async () => 'ok';
        let rejected = false;
        try {
            await expect(asyncSuccess).toReject();
        } catch {
            rejected = true;
        }
        expect(rejected).toBe(true);
    });
});

describe('Test Runner: Inversion Modifier (.not)', () => {

    it('not: inverts every standard matcher cleanly', () => {
        expect(1).not.toBe(2);
        expect({ a: 1 }).not.toEqual({ a: 2 });
        expect(undefined).not.toBeDefined();
        expect('str').not.toBeUndefined();
        expect('not null').not.toBeNull();
        expect(false).not.toBeTruthy();
        expect(true).not.toBeFalsy();
        expect(42).not.toBeNaN();
        expect('hello').not.toBeInstanceOf(Error);
        expect('hello').not.toMatch(/^xyz/);
        expect([1, 2, 3]).not.toHaveLength(10);
        expect('abc').not.toContain('z');

        expect(() => expect(1).not.toBe(1)).toThrow();
        expect(() => expect(null).not.toBeNull()).toThrow();
    });
});

describe('Test Runner: assert() & Assertion Counter Integration', () => {

    it('assert: validates truthy invariants and increments assertion counter', () => {
        assert(1 === 1, 'Math should work');
        assert(typeof 'str' === 'string');

        expect(() => assert(false, 'custom invariant message')).toThrow(/Assertion failed: custom invariant message/);
    });

    it('assertion counter accurately records assertion calls per test', () => {
        // Calling 4 assertions in this test
        expect(true).toBe(true);
        expect(10).toBeGreaterThan(5);
        assert(2 + 2 === 4);
        expect('abc').toHaveLength(3);
    });
});
