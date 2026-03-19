
## 2024-05-24 - Weak Randomness in ID Generation

**Vulnerability:** Found insecure pseudo-randomness using `Math.random()` in both `PasswordVault.generateId()` and `ChunkManager.generateId()`.
**Learning:** `Math.random()` is predictable and not cryptographically secure. Using it to generate IDs for highly sensitive assets like password vault entries and steganographic data chunks introduces a risk of collisions or predictable sequence generation.
**Prevention:** Always rely on secure cryptographic primitives, such as the Web Crypto API `crypto.randomUUID()` (or the compatibility wrapper `cryptoInstance.randomUUID()`), for generating unique identifiers, tokens, and cryptographic keys.
