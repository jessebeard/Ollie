## 2024-05-24 - [Insecure Randomness in ID Generation]
**Vulnerability:** `Math.random()` was used for generating identifiers in `ChunkManager` and `PasswordVault`. This is predictably insecure and could allow identifier collision or prediction.
**Learning:** In cryptographic or unique identification contexts, standard Math PRNGs lack necessary entropy and security boundaries.
**Prevention:** Utilize standard, cryptographically secure functions like `cryptoInstance.randomUUID()` which rely on underlying secure operating system entropy.
