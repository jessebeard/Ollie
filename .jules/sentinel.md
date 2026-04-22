## 2024-04-22 - Insecure PRNG in ID Generation

**Vulnerability:** Core logic (`ImmutableVault`, `ChunkManager`, `PasswordVault` UI wrapper) used `Math.random()` to generate UUID-like identifiers for session tracking, password entries, and steganographic chunk sets. `Math.random()` is cryptographically insecure and predictable, opening up potential ID collision or prediction attacks in distributed password systems.

**Learning:** Developers often reach for `Math.random()` due to familiarity without considering the cryptographic implications of generating deterministic identifiers for distributed security structures like a password vault.

**Prevention:** Ensure globally available Web Crypto APIs (`crypto.randomUUID()` or a project compatibility wrapper like `cryptoInstance.randomUUID()`) are always used for ID generation, and include regression tests that mock `Math.random()` to check for insecure PRNG invocations.
