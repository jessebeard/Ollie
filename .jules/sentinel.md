## 2024-05-24 - Insecure Randomness in ID Generation

**Vulnerability:** `Math.random()` was being used to generate UUIDs in `ChunkManager`, `ImmutableVault`, and `app/vault.js`. `Math.random()` is not cryptographically secure, leading to predictable IDs which could potentially lead to collisions or enumeration attacks in a security-sensitive context like a Password Vault.

**Learning:** When generating unique identifiers for security-critical components (like vault entries or steganography chunks), standard Math.random() is insufficient. Cryptographically secure pseudo-random number generators (CSPRNG) must be used.

**Prevention:** Always use `crypto.randomUUID()` or `crypto.getRandomValues()` for identifier generation.
