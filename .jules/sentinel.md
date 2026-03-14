## 2024-05-18 - [Weak Randomness] Use of Math.random() in ID Generation

**Vulnerability:** The application was using the non-cryptographically secure pseudo-random number generator (PRNG) `Math.random()` to generate IDs for `ChunkManager` and `PasswordVault`. These IDs are used in security-critical contexts (like identifying chunks of encrypted data or steganographic payloads). `Math.random()` values are highly predictable.

**Learning:** `Math.random()` was likely used out of convenience because it's a built-in standard. However, in security engineering, the uniqueness and unpredictability of identifiers must be guaranteed by a cryptographically secure random number generator (CSPRNG).

**Prevention:** Always use Web Crypto API primitives like `crypto.randomUUID()` to generate UUIDs or `crypto.getRandomValues()` for raw random byte generation when creating identifiers or tokens that require unpredictability. I added Property-Based Tests that hijack `Math.random()` to ensure future developers don't mistakenly revert to insecure ID generation.