## 2025-04-05 - Insecure ID Generation

**Vulnerability:** The application was using `Math.random()` to generate UUIDs for `PasswordVault` and `ChunkManager`.
**Learning:** `Math.random()` is not cryptographically secure and predictable, which could lead to ID collisions or predictable IDs, potentially compromising the integrity of chunk reassembly or vault entry uniqueness.
**Prevention:** Always use `crypto.randomUUID()` or `crypto.getRandomValues()` for generating security-sensitive unique identifiers instead of relying on `Math.random()`.
