## 2024-04-27 - Insecure PRNG usage for Identifiers

**Vulnerability:** Weak, predictable identifier generation in `ChunkManager` and both `PasswordVault` implementations using `Math.random()`.
**Learning:** `Math.random()` is cryptographically insecure and could potentially allow predictability or collisions for vault IDs and chunk identifiers.
**Prevention:** Always use the Web Crypto API (`crypto.randomUUID()`) or the project compatibility wrapper (`cryptoInstance.randomUUID()`) for generating secure IDs or UUIDs to prevent prediction or collision attacks.
