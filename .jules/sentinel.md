## 2024-05-02 - Secure Randomness

**Vulnerability:** Weak identifier generation using `Math.random()`.
**Learning:** `Math.random()` is not cryptographically secure, predictable, and should never be used for ID or UUID generation, particularly in security-focused code bases.
**Prevention:** Use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) or a wrapper around it to ensure unpredictable randomness.
