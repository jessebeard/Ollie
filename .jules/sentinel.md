## 2024-05-24 - [Fix Insecure Randomness in UUID Generation]

**Vulnerability:** The application was using `Math.random()` to generate UUIDs in `ChunkManager` and `PasswordVault`. `Math.random()` is not cryptographically secure and the resulting UUIDs are predictable, which could potentially allow attackers to guess chunk IDs or vault entry IDs.

**Learning:** When generating unique identifiers (like UUIDs) for sensitive contexts or chunk management, a cryptographically secure pseudo-random number generator (CSPRNG) must be used instead of a standard PRNG.

**Prevention:** Always use `cryptoInstance.randomUUID()` (or a similar cryptographically secure method) from the crypto-compat wrapper instead of custom logic relying on `Math.random()` when creating identifiers.
