
## 2024-03-23 - [Insecure Randomness for ID Generation]

**Vulnerability:** ID generation in `PasswordVault` and `ChunkManager` relied on the predictable `Math.random()`, which does not provide cryptographically secure randomness.

**Learning:** When predictable randomness is used for session IDs, chunk IDs, or entry IDs, attackers can predict the generated identifiers or create collisions, potentially bypassing security boundaries.

**Prevention:** Always use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) instead of `Math.random()` to generate secure unique identifiers.
