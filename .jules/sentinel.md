## 2024-04-19 - [Insecure Randomness in ID Generation]
**Vulnerability:** Core components (`PasswordVault`, `ChunkManager`) used `Math.random()` to generate IDs, which is not cryptographically secure and could lead to predictable IDs or collisions.
**Learning:** Even internal UUID generation in utility classes requires secure randomness to ensure true uniqueness and prevent predictability, especially in security-sensitive contexts like password vaults.
**Prevention:** Always use the Web Crypto API (`crypto.randomUUID()`) for generating secure, unique identifiers instead of relying on `Math.random()`. Added tests to verify ID format and ensure `Math.random()` is not called.
