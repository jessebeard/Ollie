## 2024-05-24 - Cryptographically Weak PRNG for ID Generation

**Vulnerability:** The codebase was generating unique identifiers using `Math.random().toString(36)` and a custom UUID-like generator relying on `Math.random()` in `PasswordVault` and `ChunkManager`. This is vulnerable because `Math.random()` is not a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG), making the IDs predictable and potentially allowing attackers to guess entry IDs or chunk IDs to launch targeted attacks.

**Learning:** When generating identifiers that need any form of unpredictability or uniqueness for security contexts (like password entries or distributed chunk management), a CSPRNG must be used instead of a standard `Math.random()` utility.

**Prevention:** Use standard platform-provided cryptographic functions, such as `crypto.randomUUID()`, to generate secure identifiers. Add tests that mock `Math.random()` to ensure it isn't accidentally used in these paths.
