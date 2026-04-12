## 2024-06-25 - Fix Insecure Randomness in ID Generation

**Vulnerability:** The application was using `Math.random()` to generate unique IDs for steganographic chunks and password vault entries. `Math.random()` is not cryptographically secure, which could lead to predictable IDs, allowing an attacker to guess identifiers, potentially leading to collision attacks or bypassing security mechanisms that rely on unguessable IDs.

**Learning:** It is crucial to use cryptographically secure random number generators (CSPRNG) like `crypto.getRandomValues()` or `crypto.randomUUID()` when generating tokens, identifiers, or keys in security-sensitive contexts.

**Prevention:** Always use `cryptoInstance.randomUUID()` (or equivalent CSPRNG functions) instead of `Math.random()` when generating unique identifiers or sensitive tokens.
