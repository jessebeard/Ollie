## 2025-02-12 - Insecure PRNG usage for ID generation

**Vulnerability:** `Math.random()` was used for generating unique identifiers in `PasswordVault.generateId()` and `ChunkManager.generateId()`. This poses a risk for ID prediction and collision because `Math.random()` is not cryptographically secure and uses a weak PRNG.

**Learning:** Developers sometimes reach for `Math.random().toString(36)` as a quick way to generate UUIDs or unique strings, but this is unsuitable for security-sensitive contexts where predictability can be exploited.

**Prevention:** Always use the Web Crypto API, specifically `crypto.randomUUID()` or `crypto.getRandomValues()`, for any ID generation or randomization that is required to be unique and unpredictable across the application.
