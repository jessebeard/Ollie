## 2024-05-18 - Insecure Identifier Generation

**Vulnerability:** The `generateId` methods in `PasswordVault` and `ChunkManager` used `Math.random()` to generate IDs. `Math.random()` is not cryptographically secure, which means generated IDs are predictable and could lead to identifier collisions or ID guessing attacks in a security context.

**Learning:** When generating identifiers for security-critical components such as encryption chunk tracking and password vault entries, a predictable random number generator creates a vulnerability. Developers often reach for `Math.random()` because it is widely known, without considering its cryptographically insecure nature.

**Prevention:** Always use the Web Crypto API, specifically `crypto.randomUUID()` (or a custom wrapper like `cryptoInstance.randomUUID()`) for generating universally unique and secure identifiers, ensuring cross-environment consistency and cryptographically strong randomness. Tests must specifically mock insecure primitives to guarantee they aren't inadvertently introduced.