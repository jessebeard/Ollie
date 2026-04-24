## 2024-04-24 - Cryptographically Insecure ID Generation

**Vulnerability:** The `Math.random()` function was being used to generate unique IDs and UUIDs across the codebase (`PasswordVault` and `ChunkManager`). `Math.random()` is not cryptographically secure and its outputs can be predicted, potentially allowing an attacker to guess IDs, bypass intended uniqueness constraints, or predict chunk distribution in steganographic operations.

**Learning:** When generating security-sensitive IDs, UUIDs, or random tokens, developers sometimes reach for `Math.random()` due to convenience or legacy browser constraints, ignoring that it is designed for statistics, not cryptography.

**Prevention:** Always use the globally available Web Crypto API (`crypto.randomUUID()` or our `cryptoInstance.randomUUID()` wrapper) for any identifier or random value generation that has security implications.
