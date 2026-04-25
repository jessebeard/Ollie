## 2025-02-14 - Predictable Vault and Chunk IDs

**Vulnerability:** IDOR/Collision due to insecure random IDs
**Learning:** `Math.random()` was used for identifier generation within `ChunkManager`, `app/vault.js`, and `immutable-vault.js`, producing predictable IDs across contexts instead of cryptographically secure values.
**Prevention:** Always use the globally available Web Crypto API (`crypto.randomUUID()`) to generate UUID v4 strings for sensitive object tracking or identification mechanisms.
