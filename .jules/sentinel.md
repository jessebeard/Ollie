## 2024-04-15 - Insecure ID Generation

**Vulnerability:** Weak, non-cryptographic randomness (`Math.random()`) was being used to generate IDs in `ChunkManager` and `PasswordVault`. While `Math.random()` generates values quickly, its PRNG sequence is predictable and cryptographically insecure, leading to potential ID collisions or predictability attacks.

**Learning:** `Math.random()` should never be used for security-sensitive operations or generating UUIDs, as it does not guarantee sufficient entropy.

**Prevention:** Always use the Web Crypto API, specifically `crypto.randomUUID()`, to generate cryptographically secure UUIDv4 strings. In Node/Browser-agnostic environments, use a compatibility wrapper like `cryptoInstance.randomUUID()`. Add tests that mock `Math.random()` to assert it is never called during ID generation, and validate the output against a strict UUIDv4 regular expression (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`).
