## 2025-01-30 - Insecure Randomness in generateId Functions

**Vulnerability:** Found `Math.random()` used in `PasswordVault.generateId()` and `ChunkManager.generateId()` for generating unique IDs. `Math.random()` generates predictable values, making ID collisions predictable and exposing potential enumeration or injection risks in distributed systems.

**Learning:** `Math.random()` is not cryptographically secure and should not be used for any security-sensitive application involving IDs, tokens, or steganography chunk metadata.

**Prevention:** Use Web Crypto API primitives like `crypto.randomUUID()` or `crypto.getRandomValues()` directly via `cryptoInstance` for all ID generation tasks.
