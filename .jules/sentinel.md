## 2026-03-16 - Fix Insecure ID Generation

**Vulnerability:** Weak randomness in ID generation. `Math.random()` was being used to generate UUIDs/identifiers in `ChunkManager` and `PasswordVault`.

**Learning:** `Math.random()` is not a CSPRNG (Cryptographically Secure Pseudo-Random Number Generator) and its output is predictable. This predictability could lead to identifier collisions or allow attackers to guess sequential IDs generated in batch processing or vault updates.

**Prevention:** Always use the Web Crypto API's `crypto.randomUUID()` or `crypto.getRandomValues()` for security-sensitive unique identifiers instead of `Math.random()`. Added format validation and collision tests.
