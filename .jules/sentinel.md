## 2024-05-20 - Insecure Identifier Generation

**Vulnerability:** Weak, predictable identifier generation using `Math.random()`. Several `generateId` methods relied on `Math.random()` to generate UUID-like strings. This exposes the application to collision risks and potentially allows attackers to predict or enumerate generated IDs, which can be critical for security identifiers or session tracking.

**Learning:** `Math.random()` is not cryptographically secure and should never be used for security-sensitive operations or for generating unique identifiers where unpredictability is required.

**Prevention:** Always use cryptographically secure pseudo-random number generators (CSPRNG) for generating unique identifiers. In this codebase, the `cryptoInstance.randomUUID()` method provided by the Web Crypto API should be used instead of rolling custom random strings or relying on `Math.random()`.
