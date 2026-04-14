## 2024-04-14 - Replace Math.random with crypto.randomUUID

**Vulnerability:** The application uses Math.random() for generating IDs in `PasswordVault.generateId()` and `ChunkManager.generateId()`. Math.random() is cryptographically insecure, making generated IDs predictable and susceptible to collision or guessing attacks.

**Learning:** When secure unique identifiers are required, rely on the crypto library's randomUUID method instead of pseudo-random generators like Math.random().

**Prevention:** Ensure any logic requiring unique, unguessable identifiers utilizes `cryptoInstance.randomUUID()` available in the imported cryptography compatibility layer.
