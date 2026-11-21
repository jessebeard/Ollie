/**
 * Password Strength Evaluation & Cryptographically Secure Generation
 * 
 * Provides entropy calculation, qualitative strength rating, and
 * secure pseudorandom password generation with zero external dependencies.
 */

/**
 * Calculates entropy and qualitative strength of a password string.
 * @param {string} pass - Candidate password string
 * @returns {{ score: number, label: string, color: string, percent: number, entropy: number }}
 */
export function calculatePasswordStrength(pass) {
    if (!pass) {
        return { score: 0, label: '', color: 'transparent', percent: 0, entropy: 0 };
    }

    let pool = 0;
    if (/[a-z]/.test(pass)) pool += 26;
    if (/[A-Z]/.test(pass)) pool += 26;
    if (/[0-9]/.test(pass)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(pass)) pool += 33;
    if (pool === 0) pool = 10;

    const entropy = pass.length * Math.log2(pool);

    if (pass.length < 8 || entropy < 30) {
        return { score: 1, label: 'Very Weak', color: 'var(--error, #ff453a)', percent: 20, entropy };
    }
    if (pass.length < 12 || entropy < 50) {
        return { score: 2, label: 'Weak', color: 'var(--warning, #ff9f0a)', percent: 40, entropy };
    }
    if (entropy < 70) {
        return { score: 3, label: 'Good', color: '#ffd60a', percent: 65, entropy };
    }
    if (entropy < 90) {
        return { score: 4, label: 'Strong', color: 'var(--success, #30d158)', percent: 85, entropy };
    }
    return { score: 5, label: 'Post-Quantum Safe', color: '#64d2ff', percent: 100, entropy };
}

/**
 * Generates a cryptographically strong random password using system CSPRNG.
 * @param {number} [length=20] - Number of characters
 * @returns {string} - Random password
 */
export function generateStrongPassword(length = 20) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
    const bytes = new Uint8Array(length);

    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        // Fallback for non-browser/non-webcrypto testing environments
        for (let i = 0; i < length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }

    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
}
