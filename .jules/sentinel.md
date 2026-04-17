
## 2024-04-17 - Insecure ID Generation

**Vulnerability:** Weak, non-cryptographic ID generation (`Math.random()`) was used in `PasswordVault` and `ChunkManager`.
**Learning:** `Math.random()` provides no cryptographic security and makes generated IDs predictable, potentially allowing attackers to guess object references.
**Prevention:** Always use the Web Crypto API `crypto.randomUUID()` (or a suitable polyfill like `cryptoInstance.randomUUID()`) when generating unique identifiers in security-sensitive contexts.
