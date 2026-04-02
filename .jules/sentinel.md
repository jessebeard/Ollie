## 2024-05-24 - Insecure ID Generation

**Vulnerability:** Used Math.random() to generate IDs in PasswordVault and ChunkManager.

**Learning:** Math.random() is not cryptographically secure and predictable IDs can lead to enumeration or collisions.

**Prevention:** Always use Web Crypto API (crypto.randomUUID()) for generating unique identifiers.
