
## 2024-04-12 - Fix Weak Randomness in ID Generation

**Vulnerability:** ID generation in `ChunkManager`, `PasswordVault` (immutable), and `PasswordVault` (UI) used `Math.random()`, which is a predictable PRNG. This could allow an attacker to predict IDs and potentially cause collisions or infer state.

**Learning:** When creating unique identifiers, especially for security contexts or chunks handling sensitive encrypted data, cryptographically secure randomness must be used. `Math.random()` does not provide adequate entropy.

**Prevention:** Always use `crypto.randomUUID()` (or a web-crypto compatible wrapper like `cryptoInstance`) for generating unique IDs instead of `Math.random()`.
