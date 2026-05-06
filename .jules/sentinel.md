## 2024-05-06 - Weak PRNG Vulnerability (Math.random)
**Vulnerability:** ID generation (`generateId`) relied on `Math.random()`, which is not cryptographically secure and is vulnerable to prediction.
**Learning:** This existed because `Math.random()` was easily available and there was no strict check forcing the use of the Web Crypto API, leaving both the Vault and ChunkManager exposed to predictable identifiers.
**Prevention:** In the future, always enforce the use of `crypto.randomUUID()` when generating unique identifiers, and fallback only to secure options. Always check if a system uses `Math.random` when dealing with security, tokens, or IDs.
