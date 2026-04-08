## 2025-04-08 - Insecure ID Generation

**Vulnerability:** Weak randomness. `Math.random()` was being used to generate unique identifiers (IDs) in `ChunkManager`, `PasswordVault`, and `app/vault.js`. `Math.random()` is cryptographically insecure and predictable, which could lead to ID collisions or allow an attacker to correlate entries/chunks or predict future IDs.

**Learning:** When building security-sensitive applications, standard non-cryptographic random number generators should never be used for security primitives like unique IDs or tokens.

**Prevention:** Use cryptographically secure random number generators (CSPRNG). In JS environments, `crypto.randomUUID()` provides standard v4 UUIDs driven by secure entropy. Enforce this via a linter rule prohibiting `Math.random()` or property-based tests mocking `Math.random()` to ensure it is not called during secure operations.
