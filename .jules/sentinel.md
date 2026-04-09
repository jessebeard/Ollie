## 2024-04-09 - Insecure Random UUID Generation

**Vulnerability:** Several classes (`PasswordVault` and `ChunkManager`) used `Math.random()` to generate unique identifiers (UUIDs), which is cryptographically insecure and predictable. This predictability could be exploited to guess vault entries or chunk identifiers.
**Learning:** `Math.random()` is not suitable for generating security-sensitive unique identifiers due to its predictability.
**Prevention:** Always use cryptographically secure primitives, such as `crypto.randomUUID()` (or a webcrypto-compatible implementation) for generating unique IDs. Added Property-Based Tests that mock `Math.random()` to assert it is never called during ID generation.
