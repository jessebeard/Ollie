## 2025-02-17 - Replace Predictable `Math.random` with Secure `crypto.randomUUID`

**Vulnerability:** Weak randomness. Both `PasswordVault.generateId()` and `ChunkManager.generateId()` used `Math.random()` to generate unique identifiers. For a password vault, identifiers should be secure and unpredictable to prevent collisions or guessing attacks. `Math.random` is cryptographically insecure and its sequence can be predicted, especially when paired with an easily guessable initial seed like `Date.now()`.

**Learning:** When generating identifiers for secure records or metadata chunks, cryptographic random primitives must always be used over fast but deterministic random generators. In this project, `Math.random` should never be used for any security or uniqueness-critical operations.

**Prevention:** Ensure the use of `crypto.randomUUID()` for unique identifiers and `crypto.getRandomValues()` for bytes generation across the codebase rather than any math-based pseudo-random number generator.
