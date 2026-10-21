import { describe, it, expect } from './test-runner.js';
import { calculatePasswordStrength, generateStrongPassword } from '../../src/utils/password-strength.js';

describe('PasswordStrength Utility (Unit Tests)', () => {
    it('handles empty or missing password strings gracefully', () => {
        const emptyResult = calculatePasswordStrength('');
        expect(emptyResult.score).toBe(0);
        expect(emptyResult.label).toBe('');
        expect(emptyResult.percent).toBe(0);
        expect(emptyResult.entropy).toBe(0);

        const nullResult = calculatePasswordStrength(null);
        expect(nullResult.score).toBe(0);
        expect(nullResult.percent).toBe(0);

        const undefinedResult = calculatePasswordStrength(undefined);
        expect(undefinedResult.score).toBe(0);
        expect(undefinedResult.percent).toBe(0);
    });

    it('evaluates short or low-entropy passwords as Very Weak (score 1)', () => {
        const r1 = calculatePasswordStrength('123456');
        expect(r1.score).toBe(1);
        expect(r1.label).toBe('Very Weak');
        expect(r1.percent).toBe(20);

        const r2 = calculatePasswordStrength('short');
        expect(r2.score).toBe(1);
        expect(r2.label).toBe('Very Weak');
    });

    it('evaluates medium passwords correctly across score tiers', () => {
        // 8-11 chars lowercase + numbers
        const weak = calculatePasswordStrength('pass1234');
        expect(weak.score).toBe(2);
        expect(weak.label).toBe('Weak');
        expect(weak.percent).toBe(40);

        // 12+ chars with entropy between 50 and 70 (score 3)
        const good = calculatePasswordStrength('correcthorse');
        expect(good.score).toBe(3);
        expect(good.label).toBe('Good');
        expect(good.percent).toBe(65);

        // Entropy between 70 and 90 (score 4)
        const strong = calculatePasswordStrength('CorrectHorse7');
        expect(strong.score).toBe(4);
        expect(strong.label).toBe('Strong');
        expect(strong.percent).toBe(85);

        // High entropy (>= 90 bits)
        const quantumSafe = calculatePasswordStrength('X8#mK9$vL2!pQ5^wR7*tY1@bN4&zM9~q');
        expect(quantumSafe.score).toBe(5);
        expect(quantumSafe.label).toBe('Post-Quantum Safe');
        expect(quantumSafe.percent).toBe(100);
        expect(quantumSafe.entropy).toBeGreaterThan(90);
    });

    it('generates cryptographically strong random passwords of default and custom length', () => {
        const defaultPass = generateStrongPassword();
        expect(typeof defaultPass).toBe('string');
        expect(defaultPass.length).toBe(20);

        const customPass12 = generateStrongPassword(12);
        expect(customPass12.length).toBe(12);

        const customPass32 = generateStrongPassword(32);
        expect(customPass32.length).toBe(32);

        // Generated passwords should evaluate to Strong or Post-Quantum Safe
        const strength20 = calculatePasswordStrength(defaultPass);
        expect(strength20.score).toBeGreaterThanOrEqual(4);

        const strength32 = calculatePasswordStrength(customPass32);
        expect(strength32.score).toBe(5);
    });

    it('produces distinct passwords across successive generations', () => {
        const set = new Set();
        for (let i = 0; i < 20; i++) {
            set.add(generateStrongPassword(16));
        }
        expect(set.size).toBe(20);
    });
});
